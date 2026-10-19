import type { AgendaAppointment, ServiceSummary } from "./types"
import { fromZonedTime } from "date-fns-tz"

export const demoServices: ServiceSummary[] = [
  {
    id: "d3fd8488-636e-40cb-bf1d-9ab9930028da",
    name: "Női hajvágás",
    durationMinutes: 60,
    priceHuf: 9500,
    depositHuf: null,
    isActive: true,
    isDefault: true,
  },
  {
    id: "ba1a4aca-30e8-4e7a-9d01-f947f3f282b4",
    name: "Tőfestés",
    durationMinutes: 90,
    priceHuf: 18000,
    depositHuf: null,
    isActive: true,
    isDefault: false,
  },
  {
    id: "527485c3-593b-420d-bd8d-4c26e453a7bd",
    name: "Mosás és szárítás",
    durationMinutes: 45,
    priceHuf: 6500,
    depositHuf: null,
    isActive: true,
    isDefault: false,
  },
]

export const demoMemberId = "a80c783c-ddca-4610-afc0-5f5fb353002b"

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000)
}

export function getDemoAppointments(): AgendaAppointment[] {
  const timezone = "Europe/Budapest"
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const date = `${dateParts.find((part) => part.type === "year")?.value}-${dateParts.find((part) => part.type === "month")?.value}-${dateParts.find((part) => part.type === "day")?.value}`

  const entries = [
    {
      minutes: 0,
      name: "Kovács Anna",
      phone: "+36 30 123 4567",
      service: demoServices[0],
      paid: false,
    },
    {
      minutes: 150,
      name: "Nagy Réka",
      phone: "+36 20 234 5678",
      service: demoServices[1],
      paid: true,
    },
    {
      minutes: 300,
      name: "Tóth Júlia",
      phone: "+36 70 345 6789",
      service: demoServices[2],
      paid: false,
    },
  ]

  return entries.map((entry, index) => {
    const startsAt = addMinutes(
      fromZonedTime(`${date}T09:00:00`, timezone),
      entry.minutes
    )
    const endsAt = addMinutes(startsAt, entry.service.durationMinutes)
    return {
      id: `demo-appointment-${index + 1}`,
      customerName: entry.name,
      phone: entry.phone,
      serviceName: entry.service.name,
      durationMinutes: entry.service.durationMinutes,
      priceHuf: entry.service.priceHuf,
      notes: null,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "confirmed",
      isPaid: entry.paid,
      staffId: demoMemberId,
      staffName: "Édit",
    }
  })
}

export const demoCustomers = [
  {
    id: "customer-anna",
    name: "Kovács Anna",
    phone: "+36 30 123 4567",
    email: "anna@example.com",
    lastVisit: "2026-10-10",
    visits: 8,
  },
  {
    id: "customer-reka",
    name: "Nagy Réka",
    phone: "+36 20 234 5678",
    email: "reka@example.com",
    lastVisit: "2026-09-28",
    visits: 12,
  },
  {
    id: "customer-julia",
    name: "Tóth Júlia",
    phone: "+36 70 345 6789",
    email: null,
    lastVisit: "2026-09-12",
    visits: 3,
  },
]
