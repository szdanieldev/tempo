import { addDays } from "date-fns"
import { fromZonedTime } from "date-fns-tz"
import {
  calculateAvailableSlots,
  type AvailableSlot,
  type LocalWorkingHours,
} from "@/lib/availability"
import { demoServices } from "@/lib/domain/demo-data"
import {
  getLocalDateString,
  getUtcRangeForLocalDate,
} from "@/lib/server/agenda-data"
import { getDemoAppointments } from "@/lib/domain/demo-data"
import { createServiceSupabaseClient } from "@/lib/server/supabase"

export type PublicService = {
  id: string
  name: string
  durationMinutes: number
  priceHuf: number
  depositHuf: number | null
}
export type PublicStaff = { id: string; name: string }
export type PublicTenant = {
  id: string
  slug: string
  name: string
  locale: "hu" | "en"
  timezone: string
  appearance: { description: string; color: string; logoUrl: string | null }
  services: PublicService[]
  staff: PublicStaff[]
  settings: {
    booking: {
      minimum_notice_minutes: number
      max_days_ahead: number
      buffer_minutes: number
      cancellation_window_hours: number
      auto_confirm: boolean
    }
    payments: { on_site: boolean; stripe_online: boolean }
  }
  stripeAccountId: string | null
  stripeConnectEnabled: boolean
  demo: boolean
}

const demoOpeningHours: LocalWorkingHours[] = [1, 2, 3, 4, 5, 6].map(
  (weekday) => ({ weekday, opensAt: "09:00", closesAt: "17:00" })
)

export async function getPublicTenant(
  slug: string
): Promise<PublicTenant | null> {
  const client = createServiceSupabaseClient()
  if (!client) {
    if (process.env.NODE_ENV === "production" || slug !== "editfodraszat")
      return null
    return {
      id: "demo-org",
      slug,
      name: "Édit Fodrászat",
      locale: "hu",
      timezone: "Europe/Budapest",
      appearance: { description: "", color: "#416e7e", logoUrl: null },
      services: demoServices
        .filter((service) => service.isActive)
        .map((service) => ({
          id: service.id,
          name: service.name,
          durationMinutes: service.durationMinutes,
          priceHuf: service.priceHuf,
          depositHuf: service.depositHuf,
        })),
      staff: [{ id: "a80c783c-ddca-4610-afc0-5f5fb353002b", name: "Édit" }],
      settings: {
        booking: {
          minimum_notice_minutes: 0,
          max_days_ahead: 60,
          buffer_minutes: 0,
          cancellation_window_hours: 24,
          auto_confirm: true,
        },
        payments: { on_site: true, stripe_online: false },
      },
      stripeAccountId: null,
      stripeConnectEnabled: false,
      demo: true,
    }
  }

  const { data: organization } = await client
    .from("organizations")
    .select(
      "id,slug,name,default_locale,timezone,settings,stripe_account_id,stripe_connect_enabled"
    )
    .eq("slug", slug)
    .maybeSingle()
  if (!organization) return null
  const [serviceResult, staffResult] = await Promise.all([
    client
      .from("services")
      .select("id,name,duration_minutes,price_huf,deposit_huf")
      .eq("org_id", organization.id)
      .eq("is_active", true)
      .order("is_default", { ascending: false })
      .order("name"),
    client
      .from("members")
      .select("id,display_name")
      .eq("org_id", organization.id)
      .eq("is_active", true)
      .order("created_at"),
  ])
  const settings = organization.settings as PublicTenant["settings"]
  const bookingPage = (
    organization.settings as {
      booking_page?: {
        description?: string
        color?: string
        logo_url?: string | null
      }
    } | null
  )?.booking_page
  return {
    id: organization.id,
    slug: organization.slug,
    name: organization.name,
    locale: organization.default_locale === "en" ? "en" : "hu",
    timezone: organization.timezone,
    appearance: {
      description: bookingPage?.description ?? "",
      color: bookingPage?.color ?? "#416e7e",
      logoUrl: bookingPage?.logo_url ?? null,
    },
    services: (serviceResult.data ?? []).map((service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      priceHuf: service.price_huf,
      depositHuf: service.deposit_huf,
    })),
    staff: (staffResult.data ?? []).map((member) => ({
      id: member.id,
      name: member.display_name,
    })),
    settings: settings ?? {
      booking: {
        minimum_notice_minutes: 120,
        max_days_ahead: 60,
        buffer_minutes: 0,
        cancellation_window_hours: 24,
        auto_confirm: true,
      },
      payments: { on_site: true, stripe_online: false },
    },
    stripeAccountId: organization.stripe_account_id,
    stripeConnectEnabled: organization.stripe_connect_enabled,
    demo: false,
  }
}

export async function getPublicSlots(
  tenant: PublicTenant,
  serviceId: string,
  date: string,
  staffId?: string | null,
  excludeAppointmentId?: string
): Promise<Array<AvailableSlot & { staffId: string }>> {
  const service = tenant.services.find((item) => item.id === serviceId)
  if (!service) return []
  const client = createServiceSupabaseClient()
  if (!client && !tenant.demo) return []
  if (tenant.demo) {
    const busyAppointments = getDemoAppointments()
      .filter(
        (appointment) =>
          getLocalDateString(
            new Date(appointment.startsAt),
            tenant.timezone
          ) === date
      )
      .map((appointment) => ({
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
      }))
    const slots = calculateAvailableSlots({
      date,
      timezone: tenant.timezone,
      durationMinutes: service.durationMinutes,
      bufferMinutes: tenant.settings.booking.buffer_minutes,
      minimumNoticeMinutes: tenant.settings.booking.minimum_notice_minutes,
      maxDaysAhead: tenant.settings.booking.max_days_ahead,
      workingHours: demoOpeningHours,
      appointments: busyAppointments,
    })
    return slots.map((slot) => ({
      ...slot,
      staffId: tenant.staff[0]?.id ?? "a80c783c-ddca-4610-afc0-5f5fb353002b",
    }))
  }
  if (!client) return []

  const selectedStaff = tenant.staff.filter(
    (member) => !staffId || member.id === staffId
  )
  if (selectedStaff.length === 0) return []
  const range = getUtcRangeForLocalDate(date, tenant.timezone)
  const allSlots: Array<AvailableSlot & { staffId: string }> = []

  for (const staff of selectedStaff) {
    const [hoursResult, timeOffResult, appointmentResult] = await Promise.all([
      client
        .from("working_hours")
        .select("weekday,opens_at,closes_at,is_closed,member_id")
        .eq("org_id", tenant.id)
        .or(`member_id.is.null,member_id.eq.${staff.id}`),
      client
        .from("time_off")
        .select("starts_at,ends_at")
        .eq("org_id", tenant.id)
        .or(`member_id.is.null,member_id.eq.${staff.id}`)
        .lt("starts_at", range.end)
        .gt("ends_at", range.start),
      client
        .from("appointments")
        .select("starts_at,ends_at")
        .eq("org_id", tenant.id)
        .eq("staff_id", staff.id)
        .neq("status", "cancelled")
        .neq(
          "id",
          excludeAppointmentId ?? "00000000-0000-0000-0000-000000000000"
        )
        .lt("starts_at", range.end)
        .gt("ends_at", range.start),
    ])
    const ownHours = (hoursResult.data ?? []).filter(
      (item) => item.member_id === staff.id
    )
    const sharedHours = (hoursResult.data ?? []).filter(
      (item) => item.member_id === null
    )
    const mappedHours: LocalWorkingHours[] = (
      ownHours.length ? ownHours : sharedHours
    ).map((item) => ({
      weekday: item.weekday,
      opensAt: item.opens_at.slice(0, 5),
      closesAt: item.closes_at.slice(0, 5),
      isClosed: item.is_closed,
      memberId: item.member_id,
    }))
    const slots = calculateAvailableSlots({
      date,
      timezone: tenant.timezone,
      durationMinutes: service.durationMinutes,
      bufferMinutes: tenant.settings.booking.buffer_minutes,
      minimumNoticeMinutes: tenant.settings.booking.minimum_notice_minutes,
      maxDaysAhead: tenant.settings.booking.max_days_ahead,
      workingHours: mappedHours,
      timeOff: (timeOffResult.data ?? []).map((item) => ({
        startsAt: item.starts_at,
        endsAt: item.ends_at,
      })),
      appointments: (appointmentResult.data ?? []).map((item) => ({
        startsAt: item.starts_at,
        endsAt: item.ends_at,
      })),
    })
    allSlots.push(...slots.map((slot) => ({ ...slot, staffId: staff.id })))
  }

  const unique = new Map<string, AvailableSlot & { staffId: string }>()
  for (const slot of allSlots.sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt)
  )) {
    if (!unique.has(slot.startsAt)) unique.set(slot.startsAt, slot)
  }
  return [...unique.values()]
}

export function getUtcRangeForDate(date: string, timezone: string) {
  const start = fromZonedTime(`${date}T00:00:00`, timezone)
  const [year, month, day] = date.split("-").map(Number)
  const tomorrow = addDays(new Date(Date.UTC(year, month - 1, day, 12)), 1)
    .toISOString()
    .slice(0, 10)
  const end = fromZonedTime(`${tomorrow}T00:00:00`, timezone)
  return { start: start.toISOString(), end: end.toISOString() }
}
