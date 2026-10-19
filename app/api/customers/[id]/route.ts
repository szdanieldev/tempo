import { NextResponse } from "next/server"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createTenantSupabaseClient } from "@/lib/server/supabase"

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwnerContext()
  const { id } = await context.params
  if (!owner.isDemo && (!owner.orgId || !owner.userId)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (owner.isDemo) return NextResponse.json({ id, demo: true })
  const client = await createTenantSupabaseClient()
  if (!client || !owner.orgId) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const [{ data: customer }, { data: appointments }] = await Promise.all([
    client.from("customers").select("id,name,phone,email,preferred_locale,created_at").eq("org_id", owner.orgId).eq("id", id).maybeSingle(),
    client.from("appointments").select("id,starts_at,ends_at,status,price_huf,notes,service:services(name)").eq("org_id", owner.orgId).eq("customer_id", id).order("starts_at", { ascending: false }),
  ])
  if (!customer) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json({ customer, appointments }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwnerContext()
  const { id } = await context.params
  if (!owner.isDemo && (!owner.orgId || !isOrganizationAdmin(owner.role))) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
  const client = await createTenantSupabaseClient()
  if (!client || !owner.orgId) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const { error } = await client.from("customers").delete().eq("org_id", owner.orgId).eq("id", id)
  if (error) return NextResponse.json({ error: "could_not_delete_customer" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
