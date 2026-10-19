import { createHash } from "node:crypto"
import { formatInTimeZone } from "date-fns-tz"
import { NextResponse } from "next/server"
import { getPublicSlots, getPublicTenant } from "@/lib/server/public-booking"
import { allowRequest, getRequestIp } from "@/lib/server/rate-limit"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { deliverAppointmentEmail } from "@/lib/server/notifications"
import { manageAppointmentSchema } from "@/lib/validation"

async function findManageableAppointment(token: string) {
  const client = createServiceSupabaseClient()
  if (!client) return null
  const tokenHash = createHash("sha256").update(token).digest("hex")
  const { data: appointment } = await client.from("appointments").select("id,org_id,customer_id,service_id,staff_id,starts_at,ends_at,status,price_huf,manage_token_hash").eq("manage_token_hash", tokenHash).maybeSingle()
  if (!appointment) return null
  const [{ data: organization }, { data: customer }, { data: service }] = await Promise.all([
    client.from("organizations").select("id,slug,name,timezone,default_locale,settings,stripe_account_id").eq("id", appointment.org_id).maybeSingle(),
    client.from("customers").select("name,phone,email,preferred_locale").eq("id", appointment.customer_id).maybeSingle(),
    client.from("services").select("name,duration_minutes").eq("id", appointment.service_id).maybeSingle(),
  ])
  if (!organization || !customer || !service) return null
  return { client, appointment, organization, customer, service }
}

export async function GET(request: Request) {
  const ip = getRequestIp(request)
  if (!await allowRequest(`public-manage:${ip}`, 20)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  const token = new URL(request.url).searchParams.get("token") ?? ""
  if (token.length < 32 || token.length > 128) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const record = await findManageableAppointment(token)
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const { appointment, organization, customer, service } = record
  const bookingSettings = (organization.settings as { booking?: { cancellation_window_hours?: number; max_days_ahead?: number } }).booking
  const cancellationWindowHours = bookingSettings?.cancellation_window_hours ?? 24
  return NextResponse.json({
    appointment: { id: appointment.id, serviceId: appointment.service_id, staffId: appointment.staff_id, startsAt: appointment.starts_at, endsAt: appointment.ends_at, status: appointment.status, priceHuf: appointment.price_huf },
    customer: { name: customer.name }, service: { name: service.name, durationMinutes: service.duration_minutes },
    canModify: new Date(appointment.starts_at).getTime() - Date.now() >= cancellationWindowHours * 60 * 60_000,
    organization: { slug: organization.slug, name: organization.name, timezone: organization.timezone, defaultLocale: organization.default_locale, maxDaysAhead: bookingSettings?.max_days_ahead ?? 60, cancellationWindowHours },
  }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function PATCH(request: Request) {
  const ip = getRequestIp(request)
  if (!await allowRequest(`public-manage:${ip}`, 20)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  const parsed = manageAppointmentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  const record = await findManageableAppointment(parsed.data.token)
  if (!record) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const { client, appointment, organization, customer, service } = record
  if (appointment.status === "cancelled" || appointment.status === "completed") return NextResponse.json({ error: "appointment_closed" }, { status: 409 })
  const cancellationWindowHours = ((organization.settings as { booking?: { cancellation_window_hours?: number } }).booking?.cancellation_window_hours) ?? 24
  if (new Date(appointment.starts_at).getTime() - Date.now() < cancellationWindowHours * 60 * 60_000) return NextResponse.json({ error: "cancellation_window_closed" }, { status: 409 })

  if (parsed.data.action === "cancel") {
    const { error } = await client.from("appointments").update({ status: "cancelled" }).eq("id", appointment.id).eq("org_id", organization.id)
    if (error) return NextResponse.json({ error: "could_not_cancel" }, { status: 500 })
    if (customer.email) {
      await deliverAppointmentEmail({
        orgId: organization.id, appointmentId: appointment.id, type: "cancellation", to: customer.email,
        locale: customer.preferred_locale === "en" ? "en" : "hu", name: customer.name,
        serviceName: service.name, startsAt: appointment.starts_at, timezone: organization.timezone, priceHuf: appointment.price_huf,
      })
    }
    return NextResponse.json({ ok: true, action: "cancel" })
  }

  if (!parsed.data.startsAt) return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  const startsAt = new Date(parsed.data.startsAt)
  const date = formatInTimeZone(startsAt, organization.timezone, "yyyy-MM-dd")
  const tenant = await getPublicTenant(organization.slug)
  if (!tenant) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const slots = await getPublicSlots(tenant, appointment.service_id, date, appointment.staff_id, appointment.id)
  const slot = slots.find((candidate) => candidate.startsAt === startsAt.toISOString() && candidate.staffId === appointment.staff_id)
  if (!slot) return NextResponse.json({ error: "slot_unavailable" }, { status: 409 })
  const { error } = await client.from("appointments").update({ starts_at: slot.startsAt, ends_at: slot.endsAt }).eq("id", appointment.id).eq("org_id", organization.id)
  if (error) return NextResponse.json({ error: error.code === "23P01" ? "slot_unavailable" : "could_not_reschedule" }, { status: error.code === "23P01" ? 409 : 500 })
  return NextResponse.json({ ok: true, action: "reschedule" })
}
