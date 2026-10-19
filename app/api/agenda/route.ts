import { NextResponse } from "next/server"
import { getAgendaData } from "@/lib/server/agenda-data"
import { getOwnerContext } from "@/lib/server/auth"
import { publicSlotsSchema } from "@/lib/validation"

export async function GET(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.isDemo && !owner.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const date = new URL(request.url).searchParams.get("date") ?? ""
  const parsed = publicSlotsSchema.pick({ date: true }).safeParse({ date })
  if (!parsed.success) return NextResponse.json({ error: "Invalid date" }, { status: 400 })
  const data = await getAgendaData(parsed.data.date)
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } })
}
