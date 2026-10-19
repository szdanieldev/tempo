import { NextResponse } from "next/server"
import { deliverAppointmentEmail } from "@/lib/server/notifications"
import { createServiceSupabaseClient } from "@/lib/server/supabase"

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: "cron_not_configured" }, { status: 503 })
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const database = createServiceSupabaseClient()
  if (!database) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })

  const now = new Date()
  const horizon = new Date(now.getTime() + 48 * 60 * 60_000)
  const { data: appointments, error } = await database.from("appointments")
    .select("id,org_id,starts_at,price_huf,customer:customers(name,email,preferred_locale),service:services(name),organization:organizations(name,timezone,default_locale,settings)")
    .eq("status", "confirmed").gt("starts_at", now.toISOString()).lt("starts_at", horizon.toISOString()).order("starts_at").limit(1000)
  if (error) return NextResponse.json({ error: "could_not_load_reminders" }, { status: 500 })

  let attempted = 0
  let sent = 0
  for (const appointment of appointments ?? []) {
    const customer = Array.isArray(appointment.customer) ? appointment.customer[0] : appointment.customer
    const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service
    const organization = Array.isArray(appointment.organization) ? appointment.organization[0] : appointment.organization
    if (!customer?.email || !organization) continue
    const settings = organization.settings as { notifications?: { email_reminder?: boolean; reminder_hours?: number } } | null
    if (settings?.notifications?.email_reminder === false) continue
    const reminderHours = Math.max(1, settings?.notifications?.reminder_hours ?? 24)
    const dueAt = new Date(new Date(appointment.starts_at).getTime() - reminderHours * 60 * 60_000)
    if (dueAt > now) continue

    attempted += 1
    const result = await deliverAppointmentEmail({
      orgId: appointment.org_id,
      appointmentId: appointment.id,
      type: "reminder",
      to: customer.email,
      locale: customer.preferred_locale === "en" ? "en" : organization.default_locale === "en" ? "en" : "hu",
      name: customer.name,
      serviceName: service?.name ?? organization.name,
      startsAt: appointment.starts_at,
      timezone: organization.timezone,
      priceHuf: appointment.price_huf,
    })
    if (result.sent) sent += 1
  }

  return NextResponse.json({ attempted, sent })
}
