import { NextResponse } from "next/server"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { getStripeClient } from "@/lib/payments/stripe"

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId || !isOrganizationAdmin(owner.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const database = createServiceSupabaseClient()
  if (!database || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "stripe_unavailable" }, { status: 503 })
  const { data: organization } = await database.from("organizations").select("id,name,slug,stripe_account_id").eq("id", owner.orgId).maybeSingle()
  if (!organization) return NextResponse.json({ error: "organization_not_found" }, { status: 404 })

  const stripe = getStripeClient()
  let accountId = organization.stripe_account_id
  try {
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: process.env.STRIPE_CONNECT_COUNTRY || "HU",
        business_type: "individual",
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { org_id: organization.id, org_slug: organization.slug },
      }, { idempotencyKey: `tempo-connect-account-${organization.id}` })
      accountId = account.id
      const { error } = await database.from("organizations").update({ stripe_account_id: accountId, stripe_connect_enabled: false }).eq("id", organization.id)
      if (error) throw error
    }
    const origin = process.env.APP_URL || new URL(request.url).origin
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/app/settings?connect=retry`,
      return_url: `${origin}/app/settings?connect=complete`,
      collection_options: { fields: "eventually_due" },
    })
    return NextResponse.json({ url: link.url })
  } catch {
    return NextResponse.json({ error: "connect_setup_failed" }, { status: 503 })
  }
}
