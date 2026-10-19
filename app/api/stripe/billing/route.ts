import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { getStripeClient } from "@/lib/payments/stripe"

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId || !isOrganizationAdmin(owner.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_ORG_PRICE_ID) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 })
  const database = createServiceSupabaseClient()
  if (!database) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const { data: organization } = await database.from("organizations").select("id,name,stripe_customer_id,stripe_checkout_session_id,subscription_status").eq("id", owner.orgId).maybeSingle()
  if (!organization) return NextResponse.json({ error: "organization_not_found" }, { status: 404 })
  if (["active", "trialing"].includes(organization.subscription_status)) return NextResponse.json({ error: "subscription_exists" }, { status: 409 })

  const stripe = getStripeClient()
  const user = await currentUser()
  let customerId = organization.stripe_customer_id
  try {
    if (organization.stripe_checkout_session_id) {
      const existingSession = await stripe.checkout.sessions.retrieve(organization.stripe_checkout_session_id)
      if (existingSession.status === "open" && existingSession.url) return NextResponse.json({ url: existingSession.url })
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: organization.name,
        email: user?.primaryEmailAddress?.emailAddress,
        metadata: { org_id: organization.id },
      }, { idempotencyKey: `tempo-billing-customer-${organization.id}` })
      customerId = customer.id
      const { error } = await database.from("organizations").update({ stripe_customer_id: customerId }).eq("id", organization.id)
      if (error) throw error
    }
    const origin = process.env.APP_URL || new URL(request.url).origin
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: process.env.STRIPE_ORG_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: Math.max(0, Number.parseInt(process.env.STRIPE_TRIAL_DAYS || "14", 10) || 0),
        metadata: { org_id: organization.id },
      },
      metadata: { org_id: organization.id },
      success_url: `${origin}/app/settings?billing=success`,
      cancel_url: `${origin}/app/settings?billing=cancelled`,
    }, { idempotencyKey: `tempo-billing-checkout-${organization.id}-${Math.floor(Date.now() / 300_000)}` })
    if (!session.url) throw new Error("checkout_url_missing")
    const { error } = await database.from("organizations").update({ stripe_checkout_session_id: session.id }).eq("id", organization.id)
    if (error) throw error
    return NextResponse.json({ url: session.url })
  } catch {
    return NextResponse.json({ error: "billing_setup_failed" }, { status: 503 })
  }
}
