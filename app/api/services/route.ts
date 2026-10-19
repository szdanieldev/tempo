import { NextResponse } from "next/server"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createTenantSupabaseClient } from "@/lib/server/supabase"
import { serviceSchema } from "@/lib/validation"

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.isDemo && (!owner.orgId || !isOrganizationAdmin(owner.role))) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const parsed = serviceSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_service" }, { status: 400 })
  if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
  const client = await createTenantSupabaseClient()
  if (!client || !owner.orgId) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  if (parsed.data.isDefault) await client.from("services").update({ is_default: false }).eq("org_id", owner.orgId)
  const { error } = await client.from("services").upsert({
    ...(parsed.data.id ? { id: parsed.data.id } : {}), org_id: owner.orgId, name: parsed.data.name,
    duration_minutes: parsed.data.durationMinutes, price_huf: parsed.data.priceHuf,
    deposit_huf: parsed.data.depositHuf ?? null, is_active: parsed.data.isActive, is_default: parsed.data.isDefault,
  }, { onConflict: "id" })
  if (error) return NextResponse.json({ error: "could_not_save_service" }, { status: error.code === "23505" ? 409 : 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.isDemo && (!owner.orgId || !isOrganizationAdmin(owner.role))) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const body = await request.json().catch(() => null) as { id?: string; isActive?: boolean } | null
  if (!body?.id || typeof body.isActive !== "boolean") return NextResponse.json({ error: "invalid_service" }, { status: 400 })
  if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
  const client = await createTenantSupabaseClient()
  if (!client || !owner.orgId) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const { error } = await client.from("services").update({ is_active: body.isActive }).eq("id", body.id).eq("org_id", owner.orgId)
  if (error) return NextResponse.json({ error: "could_not_update_service" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
