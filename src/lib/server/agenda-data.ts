import { addDays } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import { demoServices, getDemoAppointments } from "@/lib/domain/demo-data"
import type { AgendaAppointment, ServiceSummary } from "@/lib/domain/types"
import { getOwnerContext } from "@/lib/server/auth"
import { createTenantSupabaseClient } from "@/lib/server/supabase"

export function getLocalDateString(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function getUtcRangeForLocalDate(date: string, timezone: string) {
  const start = fromZonedTime(`${date}T00:00:00`, timezone)
  const nextDate = addDays(new Date(`${date}T12:00:00.000Z`), 1)
  const nextDateString = nextDate.toISOString().slice(0, 10)
  const end = fromZonedTime(`${nextDateString}T00:00:00`, timezone)
  return { start: start.toISOString(), end: end.toISOString() }
}

export async function getOrganizationTimezone(orgId: string) {
  const client = await createTenantSupabaseClient()
  if (!client) return "Europe/Budapest"
  const { data } = await client.from("organizations").select("timezone").eq("id", orgId).maybeSingle()
  return data?.timezone ?? "Europe/Budapest"
}

export async function getAgendaData(date: string): Promise<{ appointments: AgendaAppointment[]; services: ServiceSummary[]; timezone: string; demo: boolean }> {
  const owner = await getOwnerContext()
  const client = await createTenantSupabaseClient()
  const timezone = owner.orgId && !owner.isDemo ? await getOrganizationTimezone(owner.orgId) : "Europe/Budapest"

  if (!client || !owner.orgId || owner.isDemo) {
    if (!owner.isDemo) return { appointments: [], services: [], timezone, demo: false }
    const appointments = getDemoAppointments().filter((item) => getLocalDateString(new Date(item.startsAt), timezone) === date)
    return { appointments, services: demoServices, timezone, demo: true }
  }

  const range = getUtcRangeForLocalDate(date, timezone)
  const [appointmentsResult, servicesResult] = await Promise.all([
    client.from("appointments").select("id,starts_at,ends_at,status,price_huf,notes,customer:customers(name,phone),service:services(name,duration_minutes),payment:payments(status)").eq("org_id", owner.orgId).neq("status", "cancelled").gte("starts_at", range.start).lt("starts_at", range.end).order("starts_at"),
    client.from("services").select("id,name,duration_minutes,price_huf,deposit_huf,is_active,is_default").eq("org_id", owner.orgId).eq("is_active", true).order("is_default", { ascending: false }).order("name"),
  ])

  const appointments: AgendaAppointment[] = (appointmentsResult.data ?? []).map((row) => {
    const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer
    const service = Array.isArray(row.service) ? row.service[0] : row.service
    const payment = Array.isArray(row.payment) ? row.payment[0] : row.payment
    return {
      id: row.id,
      customerName: customer?.name ?? "",
      phone: customer?.phone ?? null,
      serviceName: service?.name ?? null,
      durationMinutes: service?.duration_minutes ?? Math.max(15, Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60_000)),
      priceHuf: row.price_huf ?? 0,
      notes: row.notes,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status,
      isPaid: payment?.status === "paid",
    }
  })

  const services: ServiceSummary[] = (servicesResult.data ?? []).map((service) => ({
    id: service.id,
    name: service.name,
    durationMinutes: service.duration_minutes,
    priceHuf: service.price_huf,
    depositHuf: service.deposit_huf,
    isActive: service.is_active,
    isDefault: service.is_default,
  }))

  return { appointments, services, timezone, demo: false }
}
