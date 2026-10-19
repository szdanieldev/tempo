import { NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import { getOwnerContext } from "@/lib/server/auth"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { validateSlug } from "@/lib/slug"
import { setupSchema } from "@/lib/validation"

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId) {
    if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const parsed = setupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !validateSlug(parsed.data.slug).valid) return NextResponse.json({ error: "Invalid setup" }, { status: 400 })
  const client = createServiceSupabaseClient()
  if (!client) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })

  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || owner.userId
  const settings = {
    booking: { minimum_notice_minutes: 120, max_days_ahead: 60, buffer_minutes: 0, cancellation_window_hours: 24, auto_confirm: true },
    payments: { on_site: true, stripe_online: false },
    notifications: { email_confirmation: true, email_reminder: true, reminder_hours: 24 },
  }
  const { error: organizationError } = await client.from("organizations").upsert({ id: owner.orgId, slug: parsed.data.slug, name: parsed.data.name, default_locale: "hu", timezone: "Europe/Budapest", settings }, { onConflict: "id" })
  if (organizationError) return NextResponse.json({ error: "Booking address is already used" }, { status: 409 })

  const { data: member, error: memberError } = await client.from("members").upsert({ org_id: owner.orgId, clerk_user_id: owner.userId, display_name: displayName, email, role: owner.role ?? "org:admin" }, { onConflict: "org_id,clerk_user_id" }).select("id").single()
  if (memberError) return NextResponse.json({ error: "Could not create membership" }, { status: 500 })

  const { error: serviceError } = await client.from("services").insert({ org_id: owner.orgId, name: parsed.data.serviceName, duration_minutes: parsed.data.durationMinutes, price_huf: parsed.data.priceHuf, is_active: true, is_default: true })
  if (serviceError) return NextResponse.json({ error: "Could not create first service" }, { status: 500 })

  const hours = Array.from({ length: 7 }, (_, weekday) => ({
    org_id: owner.orgId,
    member_id: member.id,
    weekday,
    opens_at: `${parsed.data.opensAt}:00`,
    closes_at: `${parsed.data.closesAt}:00`,
    is_closed: weekday === 0 || weekday === 6,
  }))
  const { error: hoursError } = await client.from("working_hours").upsert(hours, { onConflict: "org_id,member_id,weekday" })
  if (hoursError) return NextResponse.json({ error: "Could not save opening hours" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
