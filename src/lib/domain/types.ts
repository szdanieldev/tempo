export type AppointmentStatus = "pending" | "confirmed" | "cancelled" | "completed"

export type AgendaAppointment = {
  id: string
  customerName: string
  phone: string | null
  serviceName: string | null
  durationMinutes: number
  priceHuf: number
  notes: string | null
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  isPaid: boolean
}

export type ServiceSummary = {
  id: string
  name: string
  durationMinutes: number
  priceHuf: number
  depositHuf: number | null
  isActive: boolean
  isDefault: boolean
}
