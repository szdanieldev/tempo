import { NextResponse } from "next/server"
import { fromZonedTime } from "date-fns-tz"
import { getOwnerContext } from "@/lib/server/auth"
import { getOrganizationTimezone } from "@/lib/server/agenda-data"
import { createServiceSupabaseClient, createTenantSupabaseClient } from "@/lib/server/supabase"
import type { AgendaAppointment } from "@/lib/domain/types"
import { deliverAppointmentEmail } from "@/lib/server/notifications"
import { appointmentSchema } from "@/lib/validation"

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = await getOwnerContext()
  const { id } = await context.params
  if (!owner.isDemo && (!owner.orgId || !owner.userId)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as { action?: string } | null
  if (body?.action === "paid" || body?.action === "cancel") {
    if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
    const client = await createTenantSupabaseClient()
    if (!client || !owner.orgId) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
    if (body.action === "cancel") {
      const { data: appointment, error: loadError } = await client.from("appointments").select("id,starts_at,price_huf,customer:customers(name,email,preferred_locale),service:services(name),organization:organizations(timezone)").eq("id", id).eq("org_id", owner.orgId).maybeSingle()
      if (loadError) return NextResponse.json({ error: "Could not load appointment" }, { status: 500 })
      if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
      const { error } = await client.from("appointments").update({ status: "cancelled" }).eq("id", id).eq("org_id", owner.orgId)
      if (error) return NextResponse.json({ error: "Could not cancel appointment" }, { status: 500 })
      const customer = Array.isArray(appointment.customer) ? appointment.customer[0] : appointment.customer
      const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service
      const organization = Array.isArray(appointment.organization) ? appointment.organization[0] : appointment.organization
      if (customer?.email) {
        await deliverAppointmentEmail({
          orgId: owner.orgId, appointmentId: appointment.id, type: "cancellation", to: customer.email,
          locale: customer.preferred_locale === "en" ? "en" : "hu", name: customer.name,
          serviceName: service?.name ?? "", startsAt: appointment.starts_at, timezone: organization?.timezone ?? "Europe/Budapest", priceHuf: appointment.price_huf,
        })
      }
    } else {
      const [{ data: payments }, { data: appointment }] = await Promise.all([
        client.from("payments").select("id,provider").eq("appointment_id", id).eq("org_id", owner.orgId),
        client.from("appointments").select("price_huf").eq("id", id).eq("org_id", owner.orgId).maybeSingle(),
      ])
      if (!appointment) return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
      if (payments?.some((payment) => payment.provider === "stripe")) return NextResponse.json({ error: "Online payments are confirmed by Stripe" }, { status: 409 })
      const onSitePayment = payments?.find((payment) => payment.provider === "on_site")
      const { error } = onSitePayment
        ? await client.from("payments").update({ status: "paid" }).eq("id", onSitePayment.id).eq("org_id", owner.orgId)
        : await client.from("payments").insert({ org_id: owner.orgId, appointment_id: id, provider: "on_site", amount_huf: appointment.price_huf, status: "paid" })
      if (error) return NextResponse.json({ error: "Could not mark payment" }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const parsed = appointmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: "Invalid appointment" }, { status: 400 })
  if (owner.isDemo) return NextResponse.json({ ok: true, demo: true })
  const client = await createTenantSupabaseClient()
  if (!client || !owner.orgId || !owner.userId) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  const timezone = await getOrganizationTimezone(owner.orgId)
  const startsAt = fromZonedTime(`${parsed.data.date}T${parsed.data.time}:00`, timezone)
  const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60_000)
  const { data: current, error: currentError } = await client.from("appointments").select("id,staff_id,customer_id").eq("id", id).eq("org_id", owner.orgId).maybeSingle()
  if (currentError) return NextResponse.json({ error: "Could not load appointment" }, { status: 500 })
  if (!current) return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  const { data: collisions, error: collisionError } = await client.from("appointments").select("id").eq("org_id", owner.orgId).eq("staff_id", current.staff_id).neq("id", id).neq("status", "cancelled").lt("starts_at", endsAt.toISOString()).gt("ends_at", startsAt.toISOString()).limit(1)
  if (collisionError) return NextResponse.json({ error: "Could not verify availability" }, { status: 500 })
  const hasOverlap = Boolean(collisions?.length)
  if (hasOverlap && !parsed.data.allowOverlap) return NextResponse.json({ error: "Overlap" }, { status: 409 })
  const writeClient = hasOverlap && parsed.data.allowOverlap ? createServiceSupabaseClient() : client
  if (!writeClient) return NextResponse.json({ error: "Database unavailable" }, { status: 503 })
  const { error } = await writeClient.from("appointments").update({
    starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), service_id: parsed.data.serviceId ?? null,
    price_huf: parsed.data.priceHuf, notes: parsed.data.notes ?? null, allow_overlap: Boolean(hasOverlap && parsed.data.allowOverlap),
  }).eq("id", id).eq("org_id", owner.orgId)
  if (error) return NextResponse.json({ error: error.code === "23P01" ? "Overlap" : "Could not update appointment" }, { status: error.code === "23P01" ? 409 : 500 })
  if (current.customer_id) {
    await client.from("customers").update({ name: parsed.data.name, phone: parsed.data.phone ?? null, updated_at: new Date().toISOString() }).eq("id", current.customer_id).eq("org_id", owner.orgId)
  }
  const { data: row } = await client.from("appointments").select("id,starts_at,ends_at,status,price_huf,notes,customer:customers(name,phone),service:services(name,duration_minutes),payment:payments(status)").eq("id", id).eq("org_id", owner.orgId).maybeSingle()
  if (!row) return NextResponse.json({ error: "Appointment not found" }, { status: 404 })
  const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer
  const service = Array.isArray(row.service) ? row.service[0] : row.service
  const payment = Array.isArray(row.payment) ? row.payment[0] : row.payment
  const result: AgendaAppointment = {
    id: row.id, customerName: customer?.name ?? parsed.data.name, phone: customer?.phone ?? null,
    serviceName: service?.name ?? null, durationMinutes: service?.duration_minutes ?? parsed.data.durationMinutes,
    priceHuf: row.price_huf, notes: row.notes, startsAt: row.starts_at, endsAt: row.ends_at,
    status: row.status, isPaid: payment?.status === "paid",
  }
  return NextResponse.json({ appointment: result })
}
