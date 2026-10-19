import { fromZonedTime } from "date-fns-tz"
import { NextResponse } from "next/server"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createTenantSupabaseClient } from "@/lib/server/supabase"
import {
  teamScheduleSchema,
  teamTimeOffSchema,
  timeOffDeleteSchema,
} from "@/lib/validation"

export async function GET() {
  const owner = await getOwnerContext()
  if (owner.isDemo) {
    return NextResponse.json({
      members: [
        {
          id: "a80c783c-ddca-4610-afc0-5f5fb353002b",
          displayName: "Édit",
          email: null,
          role: "org:admin",
        },
      ],
      currentMemberId: "a80c783c-ddca-4610-afc0-5f5fb353002b",
      workingHours: [1, 2, 3, 4, 5].map((weekday) => ({
        id: `demo-hours-${weekday}`,
        member_id: "a80c783c-ddca-4610-afc0-5f5fb353002b",
        weekday,
        opens_at: "09:00:00",
        closes_at: "17:00:00",
        is_closed: false,
      })),
      timeOff: [],
      demo: true,
    })
  }
  if (!owner.orgId || !owner.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const client = await createTenantSupabaseClient()
  if (!client)
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const [
    { data: members, error: memberError },
    { data: workingHours, error: hoursError },
    { data: timeOff, error: timeOffError },
  ] = await Promise.all([
    client
      .from("members")
      .select("id,display_name,email,role,clerk_user_id")
      .eq("org_id", owner.orgId)
      .eq("is_active", true)
      .order("created_at"),
    client
      .from("working_hours")
      .select("id,member_id,weekday,opens_at,closes_at,is_closed")
      .eq("org_id", owner.orgId)
      .order("weekday"),
    client
      .from("time_off")
      .select("id,member_id,starts_at,ends_at,reason")
      .eq("org_id", owner.orgId)
      .gte("ends_at", new Date().toISOString())
      .order("starts_at"),
  ])
  if (memberError || hoursError || timeOffError)
    return NextResponse.json({ error: "could_not_load_team" }, { status: 500 })
  return NextResponse.json(
    {
      members: (members ?? []).map((member) => ({
        id: member.id,
        displayName: member.display_name,
        email: member.email,
        role: member.role,
      })),
      currentMemberId: (members ?? []).find(
        (member) => member.clerk_user_id === owner.userId
      )?.id,
      workingHours: workingHours ?? [],
      timeOff: timeOff ?? [],
    },
    { headers: { "Cache-Control": "private, no-store" } }
  )
}

export async function PATCH(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const parsed = teamScheduleSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_schedule" }, { status: 400 })
  const client = await createTenantSupabaseClient()
  if (!client)
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const { data: currentMember } = await client
    .from("members")
    .select("id")
    .eq("org_id", owner.orgId)
    .eq("clerk_user_id", owner.userId)
    .maybeSingle()
  if (
    !currentMember ||
    (!isOrganizationAdmin(owner.role) &&
      currentMember.id !== parsed.data.memberId)
  )
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const rows = parsed.data.hours.map((hour) => ({
    org_id: owner.orgId,
    member_id: parsed.data.memberId,
    weekday: hour.weekday,
    opens_at: `${hour.opensAt}:00`,
    closes_at: `${hour.closesAt}:00`,
    is_closed: hour.isClosed,
  }))
  const { error } = await client
    .from("working_hours")
    .upsert(rows, { onConflict: "org_id,member_id,weekday" })
  if (error)
    return NextResponse.json(
      { error: "could_not_save_schedule" },
      { status: 500 }
    )
  return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const parsed = teamTimeOffSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (
    !parsed.success ||
    `${parsed.data.endDate}T${parsed.data.endTime}` <=
      `${parsed.data.startDate}T${parsed.data.startTime}`
  )
    return NextResponse.json({ error: "invalid_time_off" }, { status: 400 })
  const client = await createTenantSupabaseClient()
  if (!client)
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const { data: currentMember } = await client
    .from("members")
    .select("id")
    .eq("org_id", owner.orgId)
    .eq("clerk_user_id", owner.userId)
    .maybeSingle()
  if (!currentMember)
    return NextResponse.json({ error: "membership_not_ready" }, { status: 403 })
  const isAdmin = isOrganizationAdmin(owner.role)
  const memberId = isAdmin ? (parsed.data.memberId ?? null) : currentMember.id
  if (
    parsed.data.memberId &&
    !isAdmin &&
    parsed.data.memberId !== currentMember.id
  )
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const { data: organization } = await client
    .from("organizations")
    .select("timezone")
    .eq("id", owner.orgId)
    .maybeSingle()
  const timezone = organization?.timezone ?? "Europe/Budapest"
  const startsAt = fromZonedTime(
    `${parsed.data.startDate}T${parsed.data.startTime}:00`,
    timezone
  )
  const endsAt = fromZonedTime(
    `${parsed.data.endDate}T${parsed.data.endTime}:00`,
    timezone
  )
  if (endsAt <= startsAt)
    return NextResponse.json({ error: "invalid_time_off" }, { status: 400 })
  const { error } = await client
    .from("time_off")
    .insert({
      org_id: owner.orgId,
      member_id: memberId,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      reason: parsed.data.reason || null,
    })
  if (error)
    return NextResponse.json(
      { error: "could_not_save_time_off" },
      { status: 500 }
    )
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const parsed = timeOffDeleteSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_time_off" }, { status: 400 })
  const client = await createTenantSupabaseClient()
  if (!client)
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const { error } = await client
    .from("time_off")
    .delete()
    .eq("id", parsed.data.id)
    .eq("org_id", owner.orgId)
  if (error)
    return NextResponse.json(
      { error: "could_not_delete_time_off" },
      { status: 500 }
    )
  return NextResponse.json({ ok: true })
}
