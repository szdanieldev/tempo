import { NextResponse } from "next/server"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { getStripeClient } from "@/lib/payments/stripe"

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId || !isOrganizationAdmin(owner.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const database = createServiceSupabaseClient()
  if (!database || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "billing_unavailable" }, { status: 503 })
  const { data: organization } = await database.from("organizations").select("stripe_customer_id").eq("id", owner.orgId).maybeSingle()
  if (!organization?.stripe_customer_id) return NextResponse.json({ error: "billing_customer_missing" }, { status: 404 })
  try {
    const origin = process.env.APP_URL || new URL(request.url).origin
    const session = await getStripeClient().billingPortal.sessions.create({ customer: organization.stripe_customer_id, return_url: `${origin}/app/settings` })
    return NextResponse.json({ url: session.url })
  } catch {
    return NextResponse.json({ error: "billing_portal_unavailable" }, { status: 503 })
  }
}
