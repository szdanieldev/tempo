import { clerkClient, currentUser } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { validateSlug } from "@/lib/slug"
import { setupSchema } from "@/lib/validation"

function isNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false
  const record = error as { status?: number; statusCode?: number; errors?: Array<{ code?: string }> }
  return record.status === 404 || record.statusCode === 404 || record.errors?.some((item) => item.code === "resource_not_found") === true
}

function clerkSlugError(error: unknown): "slug_in_use" | "invalid_slug" | null {
  if (!error || typeof error !== "object") return null
  const record = error as { status?: number; statusCode?: number; errors?: Array<{ code?: string; message?: string }> }
  const details = record.errors?.map((item) => `${item.code ?? ""} ${item.message ?? ""}`).join(" ").toLowerCase() ?? ""
  if (details.includes("slug") && /(taken|already|exists|duplicate)/.test(details)) return "slug_in_use"
  if (details.includes("slug") && /(invalid|reserved|format)/.test(details)) return "invalid_slug"
  if (record.status === 409 || record.statusCode === 409) return "slug_in_use"
  return null
}

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.userId) {
    if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const parsed = setupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_setup" }, { status: 400 })
  const input = parsed.data
  if (!validateSlug(input.slug).valid) return NextResponse.json({ error: "invalid_slug" }, { status: 400 })

  const database = createServiceSupabaseClient()
  if (!database) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })

  let matchingOrganization: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["organizations"]["getOrganization"]>> | null = null
  let organizationId = owner.orgId
  let clerk: Awaited<ReturnType<typeof clerkClient>>

  try {
    clerk = await clerkClient()
    if (owner.orgId && !isOrganizationAdmin(owner.role)) {
      return NextResponse.json({ error: "organization_admin_required" }, { status: 403 })
    }

    if (!owner.orgId) {
      try {
        matchingOrganization = await clerk.organizations.getOrganization({ slug: input.slug })
        const membership = await clerk.organizations.getOrganizationMembershipList({
          organizationId: matchingOrganization.id,
          userId: [owner.userId],
          limit: 1,
        })
        const isAdmin = membership.data.some((item) => item.role === "org:admin" || item.role === "org:owner")
        if (!isAdmin) return NextResponse.json({ error: "slug_in_use" }, { status: 409 })
        organizationId = matchingOrganization.id
      } catch (error) {
        if (!isNotFound(error)) {
          const slugError = clerkSlugError(error)
          if (slugError) return NextResponse.json({ error: slugError }, { status: 409 })
          return NextResponse.json({ error: "organization_lookup_failed" }, { status: 502 })
        }
      }
    }
  } catch {
    return NextResponse.json({ error: "clerk_unavailable" }, { status: 503 })
  }

  const { data: conflictingOrganization, error: conflictLookupError } = await database
    .from("organizations")
    .select("id")
    .eq("slug", input.slug)
    .maybeSingle()
  if (conflictLookupError) return NextResponse.json({ error: "organization_lookup_failed" }, { status: 500 })
  if (conflictingOrganization && conflictingOrganization.id !== organizationId) {
    return NextResponse.json({ error: "slug_in_use" }, { status: 409 })
  }

  if (!organizationId) {
    try {
      const createdOrganization = await clerk!.organizations.createOrganization({
        name: input.name,
        slug: input.slug,
        createdBy: owner.userId,
      })
      organizationId = createdOrganization.id
    } catch (error) {
      const slugError = clerkSlugError(error)
      if (slugError) return NextResponse.json({ error: slugError }, { status: 409 })
      return NextResponse.json({ error: "organization_create_failed" }, { status: 502 })
    }
  } else {
    try {
      const currentOrganization = matchingOrganization?.id === organizationId
        ? matchingOrganization
        : await clerk!.organizations.getOrganization({ organizationId })
      if (currentOrganization.name !== input.name || currentOrganization.slug !== input.slug) {
        await clerk!.organizations.updateOrganization(organizationId, { name: input.name, slug: input.slug })
      }
    } catch (error) {
      const slugError = clerkSlugError(error)
      if (slugError) return NextResponse.json({ error: slugError }, { status: 409 })
      return NextResponse.json({ error: "organization_update_failed" }, { status: 502 })
    }
  }

  const settings = {
    booking: { minimum_notice_minutes: 120, max_days_ahead: 60, buffer_minutes: 0, cancellation_window_hours: 24, auto_confirm: true },
    payments: { on_site: true, stripe_online: false },
    notifications: { email_confirmation: true, email_reminder: true, reminder_hours: 24 },
  }
  const { error: organizationError } = await database.from("organizations").upsert({
    id: organizationId,
    slug: input.slug,
    name: input.name,
    default_locale: "hu",
    timezone: "Europe/Budapest",
    settings,
  }, { onConflict: "id" })
  if (organizationError) {
    if (organizationError.code === "23505") return NextResponse.json({ error: "slug_in_use" }, { status: 409 })
    return NextResponse.json({ error: "setup_save_failed" }, { status: 500 })
  }

  const user = await currentUser()
  const email = user?.primaryEmailAddress?.emailAddress ?? null
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || owner.userId
  const memberRole = isOrganizationAdmin(owner.role) || !owner.orgId ? "org:admin" : "org:member"
  const { data: member, error: memberError } = await database
    .from("members")
    .upsert({ org_id: organizationId, clerk_user_id: owner.userId, display_name: displayName, email, role: memberRole }, { onConflict: "org_id,clerk_user_id" })
    .select("id")
    .single()
  if (memberError) return NextResponse.json({ error: "member_save_failed" }, { status: 500 })

  const { data: existingService, error: serviceLookupError } = await database
    .from("services")
    .select("id")
    .eq("org_id", organizationId)
    .eq("is_default", true)
    .limit(1)
    .maybeSingle()
  if (serviceLookupError) return NextResponse.json({ error: "service_lookup_failed" }, { status: 500 })

  const serviceWrite = existingService
    ? await database.from("services").update({ name: input.serviceName, duration_minutes: input.durationMinutes, price_huf: input.priceHuf, is_active: true }).eq("id", existingService.id)
    : await database.from("services").insert({ org_id: organizationId, name: input.serviceName, duration_minutes: input.durationMinutes, price_huf: input.priceHuf, is_active: true, is_default: true })
  if (serviceWrite.error) return NextResponse.json({ error: "service_save_failed" }, { status: 500 })

  const hours = Array.from({ length: 7 }, (_, weekday) => ({
    org_id: organizationId,
    member_id: member.id,
    weekday,
    opens_at: `${input.opensAt}:00`,
    closes_at: `${input.closesAt}:00`,
    is_closed: weekday === 0 || weekday === 6,
  }))
  const { error: hoursError } = await database.from("working_hours").upsert(hours, { onConflict: "org_id,member_id,weekday" })
  if (hoursError) return NextResponse.json({ error: "hours_save_failed" }, { status: 500 })

  return NextResponse.json({ ok: true, organizationId })
}
