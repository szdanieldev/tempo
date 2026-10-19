import "server-only"
import Stripe from "stripe"
import { NextResponse } from "next/server"
import { stripePaymentProvider, getStripeClient } from "./stripe"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { claimWebhookEvent } from "@/lib/server/webhook-events"
import { deliverAppointmentEmail } from "@/lib/server/notifications"

async function syncSubscription(subscription: Stripe.Subscription) {
  const client = createServiceSupabaseClient()
  if (!client) throw new Error("database_unavailable")
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  const organizationId = subscription.metadata.org_id
  const currentPeriodEnd = Math.max(0, ...subscription.items.data.map((item) => item.current_period_end))
  let query = client.from("organizations").update({
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    subscription_current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
    stripe_checkout_session_id: null,
  })
  query = organizationId ? query.eq("id", organizationId) : query.eq("stripe_customer_id", customerId)
  const { error } = await query
  if (error) throw error
}

async function processEvent(event: Stripe.Event) {
  const client = createServiceSupabaseClient()
  if (!client) throw new Error("database_unavailable")

  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode === "subscription" && session.subscription) {
      const subscription = await getStripeClient().subscriptions.retrieve(typeof session.subscription === "string" ? session.subscription : session.subscription.id)
      await syncSubscription(subscription)
      return
    }
    if (event.type === "checkout.session.expired" && session.mode === "subscription" && session.metadata?.org_id) {
      await client.from("organizations").update({ stripe_checkout_session_id: null }).eq("id", session.metadata.org_id)
      return
    }
    const appointmentId = session.metadata?.appointment_id
    const organizationId = session.metadata?.org_id
    if (!appointmentId || !organizationId) return
    if (event.type === "checkout.session.async_payment_failed") {
      await client.from("payments").update({ status: "failed" }).eq("appointment_id", appointmentId).eq("org_id", organizationId).eq("provider", "stripe")
      await client.from("appointments").update({ status: "cancelled" }).eq("id", appointmentId).eq("org_id", organizationId)
      return
    }
    if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type) && session.payment_status === "paid") {
      const { data: payment, error } = await client.from("payments").update({ status: "paid" }).eq("appointment_id", appointmentId).eq("org_id", organizationId).eq("provider", "stripe").select("id").maybeSingle()
      if (error || !payment) throw new Error("payment_record_not_found")
      const { data: appointment, error: readError } = await client.from("appointments").select("id,org_id,customer_id,service_id,starts_at,price_huf,status").eq("id", appointmentId).eq("org_id", organizationId).maybeSingle()
      if (readError || !appointment) throw readError ?? new Error("appointment_not_found")
      if (appointment.status === "cancelled") {
        await stripePaymentProvider.refund?.(session.id)
        await client.from("payments").update({ status: "refunded" }).eq("id", payment.id)
        return
      }
      const { error: appointmentError } = await client.from("appointments").update({ status: "confirmed" }).eq("id", appointmentId).eq("org_id", organizationId)
      if (appointmentError) throw appointmentError
      const [{ data: customer }, { data: service }, { data: organization }] = await Promise.all([
        client.from("customers").select("name,email,preferred_locale").eq("id", appointment.customer_id).maybeSingle(),
        client.from("services").select("name").eq("id", appointment.service_id).maybeSingle(),
        client.from("organizations").select("name,timezone,default_locale").eq("id", organizationId).maybeSingle(),
      ])
      if (customer?.email && organization) {
        await deliverAppointmentEmail({
          orgId: organizationId,
          appointmentId,
          type: "confirmation",
          to: customer.email,
          locale: customer.preferred_locale === "en" ? "en" : organization.default_locale === "en" ? "en" : "hu",
          name: customer.name,
          serviceName: service?.name ?? organization.name,
          startsAt: appointment.starts_at,
          timezone: organization.timezone,
          priceHuf: appointment.price_huf,
        })
      }
    }
    return
  }

  if (event.type.startsWith("customer.subscription.")) {
    await syncSubscription(event.data.object as Stripe.Subscription)
    return
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    const { error } = await client.from("organizations").update({ stripe_connect_enabled: Boolean(account.charges_enabled) }).eq("stripe_account_id", account.id)
    if (error) throw error
    return
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge
    if (!charge.payment_intent) return
    const intent = await getStripeClient().paymentIntents.retrieve(typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id)
    const appointmentId = intent.metadata.appointment_id
    const organizationId = intent.metadata.org_id
    if (appointmentId && organizationId) await client.from("payments").update({ status: "refunded" }).eq("appointment_id", appointmentId).eq("org_id", organizationId).eq("provider", "stripe")
  }
}

export async function handleStripeWebhook(request: Request, secret: string | undefined) {
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 })
  const signature = request.headers.get("stripe-signature")
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 })
  const rawBody = await request.text()
  let event: Stripe.Event | null
  try { event = stripePaymentProvider.handleWebhook?.(rawBody, signature, secret) ?? null } catch { return NextResponse.json({ error: "invalid_signature" }, { status: 400 }) }
  if (!event) return NextResponse.json({ error: "invalid_event" }, { status: 400 })

  const client = createServiceSupabaseClient()
  if (!client) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  let claimed: boolean
  try {
    claimed = await claimWebhookEvent(client, { id: event.id, provider: "stripe", type: event.type, payload: event })
  } catch {
    return NextResponse.json({ error: "event_store_failed" }, { status: 500 })
  }
  if (!claimed) return NextResponse.json({ received: true, duplicate: true })

  try {
    await processEvent(event)
    await client.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error: null }).eq("event_id", event.id)
    return NextResponse.json({ received: true })
  } catch (error) {
    await client.from("webhook_events").update({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "processing_failed" }).eq("event_id", event.id)
    return NextResponse.json({ error: "processing_failed" }, { status: 500 })
  }
}
