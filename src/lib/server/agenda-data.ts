import { addDays } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import {
  demoMemberId,
  demoServices,
  getDemoAppointments,
} from "@/lib/domain/demo-data"
import type {
  AgendaAppointment,
  ServiceSummary,
  StaffSummary,
} from "@/lib/domain/types"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { createTenantSupabaseClient } from "@/lib/server/supabase"

export function getLocalDateString(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? ""
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
  const { data } = await client
    .from("organizations")
    .select("timezone")
    .eq("id", orgId)
    .maybeSingle()
  return data?.timezone ?? "Europe/Budapest"
}

export async function getAgendaData(
  date: string
): Promise<{
  appointments: AgendaAppointment[]
  services: ServiceSummary[]
  timezone: string
  demo: boolean
  staffMembers: StaffSummary[]
  currentStaffId: string | null
  canAssignStaff: boolean
}> {
  const owner = await getOwnerContext()
  const canAssignStaff = owner.isDemo || isOrganizationAdmin(owner.role)
  const client = await createTenantSupabaseClient()
  const timezone =
    owner.orgId && !owner.isDemo
      ? await getOrganizationTimezone(owner.orgId)
      : "Europe/Budapest"

  if (!client || !owner.orgId || owner.isDemo) {
    if (!owner.isDemo)
      return {
        appointments: [],
        services: [],
        timezone,
        demo: false,
        staffMembers: [],
        currentStaffId: null,
        canAssignStaff,
      }
    const appointments = getDemoAppointments().filter(
      (item) => getLocalDateString(new Date(item.startsAt), timezone) === date
    )
    return {
      appointments,
      services: demoServices,
      timezone,
      demo: true,
      staffMembers: [{ id: demoMemberId, name: "Édit" }],
      currentStaffId: demoMemberId,
      canAssignStaff: true,
    }
  }

  const range = getUtcRangeForLocalDate(date, timezone)
  const [appointmentsResult, servicesResult, membersResult] = await Promise.all(
    [
      client
        .from("appointments")
        .select(
          "id,staff_id,starts_at,ends_at,status,price_huf,notes,customer:customers(name,phone),service:services(name,duration_minutes),payment:payments(status),staff:members(display_name)"
        )
        .eq("org_id", owner.orgId)
        .neq("status", "cancelled")
        .gte("starts_at", range.start)
        .lt("starts_at", range.end)
        .order("starts_at"),
      client
        .from("services")
        .select(
          "id,name,duration_minutes,price_huf,deposit_huf,is_active,is_default"
        )
        .eq("org_id", owner.orgId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name"),
      client
        .from("members")
        .select("id,display_name,clerk_user_id")
        .eq("org_id", owner.orgId)
        .eq("is_active", true)
        .order("created_at"),
    ]
  )

  const appointments: AgendaAppointment[] = (appointmentsResult.data ?? []).map(
    (row) => {
      const customer = Array.isArray(row.customer)
        ? row.customer[0]
        : row.customer
      const service = Array.isArray(row.service) ? row.service[0] : row.service
      const payment = Array.isArray(row.payment) ? row.payment[0] : row.payment
      const staff = Array.isArray(row.staff) ? row.staff[0] : row.staff
      return {
        id: row.id,
        customerName: customer?.name ?? "",
        phone: customer?.phone ?? null,
        serviceName: service?.name ?? null,
        durationMinutes:
          service?.duration_minutes ??
          Math.max(
            15,
            Math.round(
              (new Date(row.ends_at).getTime() -
                new Date(row.starts_at).getTime()) /
                60_000
            )
          ),
        priceHuf: row.price_huf ?? 0,
        notes: row.notes,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status: row.status,
        isPaid: payment?.status === "paid",
        staffId: row.staff_id,
        staffName: staff?.display_name ?? null,
      }
    }
  )

  const services: ServiceSummary[] = (servicesResult.data ?? []).map(
    (service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      priceHuf: service.price_huf,
      depositHuf: service.deposit_huf,
      isActive: service.is_active,
      isDefault: service.is_default,
    })
  )

  const allMembers = membersResult.data ?? []
  const currentStaffId =
    allMembers.find((member) => member.clerk_user_id === owner.userId)?.id ??
    null
  const staffMembers: StaffSummary[] = (
    canAssignStaff
      ? allMembers
      : allMembers.filter((member) => member.id === currentStaffId)
  ).map((member) => ({ id: member.id, name: member.display_name }))
  return {
    appointments,
    services,
    timezone,
    demo: false,
    staffMembers,
    currentStaffId,
    canAssignStaff,
  }
}
