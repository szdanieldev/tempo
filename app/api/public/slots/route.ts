import { NextResponse } from "next/server"
import { getPublicSlots, getPublicTenant } from "@/lib/server/public-booking"
import { allowRequest, getRequestIp } from "@/lib/server/rate-limit"
import { publicSlotsSchema } from "@/lib/validation"

export async function GET(request: Request) {
  const ip = getRequestIp(request)
  if (!await allowRequest(`public-slots:${ip}`, 60)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  const search = new URL(request.url).searchParams
  const parsed = publicSlotsSchema.safeParse({ slug: search.get("slug"), serviceId: search.get("serviceId"), date: search.get("date"), staffId: search.get("staffId") || null })
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 })
  const tenant = await getPublicTenant(parsed.data.slug)
  if (!tenant) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const slots = await getPublicSlots(tenant, parsed.data.serviceId, parsed.data.date, parsed.data.staffId)
  return NextResponse.json({ slots }, { headers: { "Cache-Control": "private, no-store" } })
}
