import { NextResponse } from "next/server"
import { fromZonedTime } from "date-fns-tz"
import { demoServices, getDemoAppointments } from "@/lib/domain/demo-data"
import type { AgendaAppointment, ServiceSummary } from "@/lib/domain/types"
import { getOrganizationTimezone } from "@/lib/server/agenda-data"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import {
  createServiceSupabaseClient,
  createTenantSupabaseClient,
} from "@/lib/server/supabase"
import { appointmentSchema } from "@/lib/validation"

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.isDemo && (!owner.orgId || !owner.userId))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = appointmentSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid appointment" }, { status: 400 })
  const input = parsed.data
  if (owner.isDemo) {
    const timezone = "Europe/Budapest"
    const startsAt = fromZonedTime(`${input.date}T${input.time}:00`, timezone)
    const service = input.serviceId
      ? demoServices.find((item) => item.id === input.serviceId)
      : undefined
    const durationMinutes = service?.durationMinutes ?? input.durationMinutes
    const priceHuf = input.priceHuf || service?.priceHuf || 0
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)
    const demoDate = getDemoAppointments()
    const overlaps = demoDate.some(
      (appointment) =>
        appointment.status !== "cancelled" &&
        new Date(appointment.startsAt) < endsAt &&
        new Date(appointment.endsAt) > startsAt
    )
    if (overlaps && !input.allowOverlap)
      return NextResponse.json({ error: "Overlap" }, { status: 409 })
    const appointment: AgendaAppointment = {
      id: crypto.randomUUID(),
      customerName: input.name,
      phone: input.phone ?? null,
      serviceName: service?.name ?? null,
      durationMinutes,
      priceHuf,
      notes: input.notes ?? null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "confirmed",
      isPaid: false,
      staffId: input.staffId ?? "a80c783c-ddca-4610-afc0-5f5fb353002b",
      staffName: "Édit",
    }
    return NextResponse.json({ appointment, demo: true }, { status: 201 })
  }
  const client = await createTenantSupabaseClient()
  if (!client || !owner.orgId || !owner.userId)
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  const timezone = await getOrganizationTimezone(owner.orgId)
  let service: ServiceSummary | undefined
  if (input.serviceId) {
    const { data, error } = await client
      .from("services")
      .select(
        "id,name,duration_minutes,price_huf,deposit_huf,is_active,is_default"
      )
      .eq("id", input.serviceId)
      .eq("org_id", owner.orgId)
      .maybeSingle()
    if (error || !data || !data.is_active)
      return NextResponse.json({ error: "Invalid service" }, { status: 400 })
    service = {
      id: data.id,
      name: data.name,
      durationMinutes: data.duration_minutes,
      priceHuf: data.price_huf,
      depositHuf: data.deposit_huf,
      isActive: data.is_active,
      isDefault: data.is_default,
    }
  }
  const startsAt = fromZonedTime(`${input.date}T${input.time}:00`, timezone)
  const durationMinutes = service?.durationMinutes ?? input.durationMinutes
  const priceHuf = input.priceHuf || service?.priceHuf || 0
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)

  const { data: member, error: memberError } = await client
    .from("members")
    .select("id")
    .eq("org_id", owner.orgId)
    .eq("clerk_user_id", owner.userId)
    .maybeSingle()
  if (memberError || !member)
    return NextResponse.json(
      { error: "Organization membership is not ready" },
      { status: 403 }
    )
  const staffId = input.staffId ?? member.id
  if (staffId !== member.id && !isOrganizationAdmin(owner.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const { data: staff } = await client
    .from("members")
    .select("id,display_name")
    .eq("org_id", owner.orgId)
    .eq("id", staffId)
    .eq("is_active", true)
    .maybeSingle()
  if (!staff)
    return NextResponse.json({ error: "invalid_staff" }, { status: 400 })

  const { data: collisions, error: collisionError } = await client
    .from("appointments")
    .select("id")
    .eq("org_id", owner.orgId)
    .eq("staff_id", staffId)
    .neq("status", "cancelled")
    .lt("starts_at", endsAt.toISOString())
    .gt("ends_at", startsAt.toISOString())
    .limit(1)
  if (collisionError)
    return NextResponse.json(
      { error: "Could not verify availability" },
      { status: 500 }
    )
  const hasOverlap = Boolean(collisions?.length)
  if (hasOverlap && !input.allowOverlap)
    return NextResponse.json({ error: "Overlap" }, { status: 409 })

  let customerId: string | null = null
  const customerLookup = input.phone
    ? await client
        .from("customers")
        .select("id")
        .eq("org_id", owner.orgId)
        .eq("phone", input.phone)
        .maybeSingle()
    : input.email
      ? await client
          .from("customers")
          .select("id")
          .eq("org_id", owner.orgId)
          .eq("email", input.email)
          .maybeSingle()
      : { data: null, error: null }
  if (customerLookup.data?.id) customerId = customerLookup.data.id
  else {
    const { data: customer, error } = await client
      .from("customers")
      .insert({
        org_id: owner.orgId,
        name: input.name,
        phone: input.phone ?? null,
        email: input.email ?? null,
      })
      .select("id")
      .single()
    if (error)
      return NextResponse.json(
        { error: "Could not save client" },
        { status: 500 }
      )
    customerId = customer.id
  }

  const appointmentValues = {
    org_id: owner.orgId,
    customer_id: customerId,
    service_id: input.serviceId ?? null,
    staff_id: staffId,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    status: "confirmed",
    source: "owner",
    price_huf: priceHuf,
    notes: input.notes ?? null,
    allow_overlap: Boolean(input.allowOverlap && hasOverlap),
  }
  const writeClient =
    hasOverlap && input.allowOverlap ? createServiceSupabaseClient() : client
  if (!writeClient)
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  const { data: appointmentRow, error: appointmentError } = await writeClient
    .from("appointments")
    .insert(appointmentValues)
    .select("id,starts_at,ends_at,status,price_huf,notes")
    .single()
  if (appointmentError) {
    const conflict = appointmentError.code === "23P01"
    return NextResponse.json(
      { error: conflict ? "Overlap" : "Could not save appointment" },
      { status: conflict ? 409 : 500 }
    )
  }

  await client
    .from("payments")
    .insert({
      org_id: owner.orgId,
      appointment_id: appointmentRow.id,
      provider: "on_site",
      amount_huf: priceHuf,
      status: "pending",
    })
  const result: AgendaAppointment = {
    id: appointmentRow.id,
    customerName: input.name,
    phone: input.phone ?? null,
    serviceName: service?.name ?? null,
    durationMinutes,
    priceHuf,
    notes: input.notes ?? null,
    startsAt: appointmentRow.starts_at,
    endsAt: appointmentRow.ends_at,
    status: appointmentRow.status,
    isPaid: false,
    staffId,
    staffName: staff.display_name,
  }
  return NextResponse.json({ appointment: result }, { status: 201 })
}
