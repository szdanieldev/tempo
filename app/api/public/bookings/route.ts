import { createHash, randomBytes } from "node:crypto"
import { formatInTimeZone } from "date-fns-tz"
import { NextResponse } from "next/server"
import { getPublicSlots, getPublicTenant } from "@/lib/server/public-booking"
import { allowRequest, getRequestIp } from "@/lib/server/rate-limit"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { deliverAppointmentEmail } from "@/lib/server/notifications"
import { getPaymentProvider } from "@/lib/payments"
import { publicBookingRequestSchema } from "@/lib/validation"

export async function POST(request: Request) {
  const ip = getRequestIp(request)
  if (!await allowRequest(`public-booking:${ip}`, 8, 15 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  const parsed = publicBookingRequestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_booking" }, { status: 400 })
  const input = parsed.data
  const tenant = await getPublicTenant(input.slug)
  if (!tenant) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (input.paymentMethod === "stripe" && (!tenant.settings.payments.stripe_online || !tenant.stripeConnectEnabled || !tenant.stripeAccountId)) return NextResponse.json({ error: "payment_method_unavailable" }, { status: 400 })
  if (input.paymentMethod === "on_site" && !tenant.settings.payments.on_site) return NextResponse.json({ error: "payment_method_unavailable" }, { status: 400 })

  const startsAt = new Date(input.startsAt)
  const date = formatInTimeZone(startsAt, tenant.timezone, "yyyy-MM-dd")
  const availableSlots = await getPublicSlots(tenant, input.serviceId, date, input.staffId)
  const selectedSlot = availableSlots.find((slot) => slot.startsAt === startsAt.toISOString() && slot.staffId === input.staffId)
  if (!selectedSlot) return NextResponse.json({ error: "slot_unavailable" }, { status: 409 })

  const service = tenant.services.find((item) => item.id === input.serviceId)
  if (!service) return NextResponse.json({ error: "service_not_found" }, { status: 400 })
  const serviceClient = createServiceSupabaseClient()
  const token = randomBytes(32).toString("base64url")
  const tokenHash = createHash("sha256").update(token).digest("hex")
  const origin = new URL(request.url).origin
  const manageUrl = `${origin}/manage?token=${encodeURIComponent(token)}`
  const appointmentStatus = input.paymentMethod === "stripe" ? "pending" : tenant.settings.booking.auto_confirm ? "confirmed" : "pending"

  if (!serviceClient || tenant.demo) {
    return NextResponse.json({ demo: true, manageUrl }, { status: 201 })
  }

  const [{ data: phoneCustomer }, { data: emailCustomer }] = await Promise.all([
    serviceClient.from("customers").select("id").eq("org_id", tenant.id).eq("phone", input.phone).maybeSingle(),
    serviceClient.from("customers").select("id").eq("org_id", tenant.id).eq("email", input.email).maybeSingle(),
  ])
  if (phoneCustomer?.id && emailCustomer?.id && phoneCustomer.id !== emailCustomer.id) return NextResponse.json({ error: "contact_conflict" }, { status: 409 })
  const matchingCustomer = phoneCustomer ?? emailCustomer
  let customerId = matchingCustomer?.id
  if (!customerId) {
    const { data: customer, error: customerError } = await serviceClient.from("customers").insert({ org_id: tenant.id, name: input.name, phone: input.phone, email: input.email, preferred_locale: input.locale }).select("id").single()
    if (customerError) return NextResponse.json({ error: "could_not_save_customer" }, { status: 500 })
    customerId = customer.id
  } else {
    await serviceClient.from("customers").update({ name: input.name, phone: input.phone, email: input.email, preferred_locale: input.locale, updated_at: new Date().toISOString() }).eq("org_id", tenant.id).eq("id", customerId)
  }

  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000)
  const priceHuf = service.priceHuf
  const { data: appointment, error: appointmentError } = await serviceClient.from("appointments").insert({
    org_id: tenant.id,
    customer_id: customerId,
    service_id: service.id,
    staff_id: input.staffId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: appointmentStatus,
    source: "public",
    price_huf: priceHuf,
    notes: input.notes ?? null,
    manage_token_hash: tokenHash,
  }).select("id").single()
  if (appointmentError) return NextResponse.json({ error: appointmentError.code === "23P01" ? "slot_unavailable" : "could_not_save_booking" }, { status: appointmentError.code === "23P01" ? 409 : 500 })

  let checkoutUrl: string | null = null
  if (input.paymentMethod === "stripe") {
    const provider = getPaymentProvider("stripe")
    const dueNow = service.depositHuf && service.depositHuf > 0 ? service.depositHuf : service.priceHuf
    const { data: paymentRow, error: paymentRowError } = await serviceClient.from("payments").insert({ org_id: tenant.id, appointment_id: appointment.id, provider: "stripe", amount_huf: dueNow, status: "pending" }).select("id").single()
    if (paymentRowError || !paymentRow) {
      await serviceClient.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id).eq("org_id", tenant.id)
      return NextResponse.json({ error: "payment_unavailable" }, { status: 503 })
    }
    try {
      const payment = await provider.createPayment({
        orgId: tenant.id, organizationName: tenant.name, connectedAccountId: tenant.stripeAccountId,
        appointmentId: appointment.id, serviceName: service.name, amountHuf: dueNow, customerEmail: input.email,
        successUrl: `${origin}/?payment=success&booking={CHECKOUT_SESSION_ID}&token=${encodeURIComponent(token)}`,
        cancelUrl: `${origin}/?payment=cancelled`,
      })
      if (!payment.checkoutUrl || !payment.providerPaymentId) throw new Error("Stripe checkout could not be created")
      checkoutUrl = payment.checkoutUrl
      const { error: updateError } = await serviceClient.from("payments").update({ provider_payment_id: payment.providerPaymentId }).eq("id", paymentRow.id).eq("org_id", tenant.id)
      if (updateError) {
        await provider.expirePayment?.(payment.providerPaymentId)
        throw updateError
      }
    } catch {
      await serviceClient.from("payments").update({ status: "failed" }).eq("id", paymentRow.id).eq("org_id", tenant.id)
      await serviceClient.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id).eq("org_id", tenant.id)
      return NextResponse.json({ error: "payment_unavailable" }, { status: 503 })
    }
  } else {
    const { error: paymentError } = await serviceClient.from("payments").insert({ org_id: tenant.id, appointment_id: appointment.id, provider: "on_site", amount_huf: priceHuf, status: "pending" })
    if (paymentError) {
      await serviceClient.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id).eq("org_id", tenant.id)
      return NextResponse.json({ error: "could_not_save_booking" }, { status: 500 })
    }
  }

  if (input.paymentMethod === "stripe" && checkoutUrl) {
    await deliverAppointmentEmail({
      orgId: tenant.id, appointmentId: appointment.id, type: "payment_required", to: input.email, locale: input.locale,
      name: input.name, serviceName: service.name, startsAt: startsAt.toISOString(), timezone: tenant.timezone, priceHuf, manageUrl, checkoutUrl,
    })
  } else {
    await deliverAppointmentEmail({
      orgId: tenant.id, appointmentId: appointment.id, type: appointmentStatus === "pending" ? "pending_approval" : "confirmation", to: input.email, locale: input.locale,
      name: input.name, serviceName: service.name, startsAt: startsAt.toISOString(), timezone: tenant.timezone, priceHuf, manageUrl,
    })
  }
  const { data: member } = await serviceClient.from("members").select("email").eq("org_id", tenant.id).eq("id", input.staffId).maybeSingle()
  if (member?.email) await deliverAppointmentEmail({
    orgId: tenant.id, appointmentId: appointment.id, type: "owner_new_booking", to: member.email, locale: tenant.locale,
    name: input.name, serviceName: service.name, startsAt: startsAt.toISOString(), timezone: tenant.timezone, priceHuf,
  })

  return NextResponse.json({ appointmentId: appointment.id, checkoutUrl, manageUrl }, { status: 201 })
}
