import { NextResponse } from "next/server"
import { clerkClient } from "@clerk/nextjs/server"
import { validateSlug } from "@/lib/slug"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createServiceSupabaseClient, createTenantSupabaseClient } from "@/lib/server/supabase"
import { organizationSettingsSchema } from "@/lib/validation"

export async function PATCH(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.isDemo && (!owner.orgId || !isOrganizationAdmin(owner.role))) return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const parsed = organizationSettingsSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !validateSlug(parsed.data.slug).valid || parsed.data.closesAt <= parsed.data.opensAt) return NextResponse.json({ error: "invalid_settings" }, { status: 400 })
  if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
  const serviceClient = createServiceSupabaseClient()
  const tenantClient = await createTenantSupabaseClient()
  if (!serviceClient || !tenantClient || !owner.orgId || !owner.userId) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })

  const { data: current } = await serviceClient.from("organizations").select("slug,settings,stripe_account_id,stripe_connect_enabled").eq("id", owner.orgId).maybeSingle()
  if (!current) return NextResponse.json({ error: "organization_not_found" }, { status: 404 })
  if (current.slug !== parsed.data.slug) {
    const { data: collision } = await serviceClient.from("organizations").select("id").eq("slug", parsed.data.slug).neq("id", owner.orgId).maybeSingle()
    if (collision) return NextResponse.json({ error: "slug_in_use" }, { status: 409 })
    await (await clerkClient()).organizations.updateOrganization(owner.orgId, { name: parsed.data.name, slug: parsed.data.slug })
  } else if (current.slug && !validateSlug(current.slug).valid) {
    return NextResponse.json({ error: "invalid_slug" }, { status: 400 })
  }

  const existing = (current.settings ?? {}) as Record<string, Record<string, unknown>>
  const settings = {
    ...existing,
    booking: { ...(existing.booking ?? {}), minimum_notice_minutes: parsed.data.minimumNoticeMinutes, max_days_ahead: parsed.data.maxDaysAhead, buffer_minutes: parsed.data.bufferMinutes, cancellation_window_hours: parsed.data.cancellationWindowHours, auto_confirm: parsed.data.autoConfirm },
    payments: { ...(existing.payments ?? {}), on_site: true, stripe_online: Boolean(parsed.data.stripeOnline && current.stripe_account_id && current.stripe_connect_enabled) },
    notifications: { ...(existing.notifications ?? {}), email_reminder: parsed.data.emailReminder, reminder_hours: 24 },
  }
  const { error: orgError } = await serviceClient.from("organizations").update({ slug: parsed.data.slug, name: parsed.data.name, default_locale: parsed.data.defaultLocale, settings }).eq("id", owner.orgId)
  if (orgError) return NextResponse.json({ error: "could_not_save_settings" }, { status: 500 })

  const { data: member } = await tenantClient.from("members").select("id").eq("org_id", owner.orgId).eq("clerk_user_id", owner.userId).maybeSingle()
  if (member) {
    for (const weekday of [1, 2, 3, 4, 5]) {
      await tenantClient.from("working_hours").upsert({ org_id: owner.orgId, member_id: member.id, weekday, opens_at: `${parsed.data.opensAt}:00`, closes_at: `${parsed.data.closesAt}:00`, is_closed: false }, { onConflict: "org_id,member_id,weekday" })
    }
  }
  return NextResponse.json({ ok: true })
}
