import { z } from "zod"

export const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/)

export const appointmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.email().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  date: z.iso.date(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  serviceId: z.uuid().nullable().optional(),
  staffId: z.uuid().nullable().optional(),
  priceHuf: z.number().int().min(0).max(10_000_000).default(0),
  durationMinutes: z.number().int().min(5).max(720).default(30),
  allowOverlap: z.boolean().default(false),
})

export const publicBookingSchema = appointmentSchema
  .extend({
    email: z.email(),
    phone: z.string().trim().min(5).max(40),
    locale: z.enum(["hu", "en"]).default("hu"),
    staffId: z.uuid().nullable().optional(),
    paymentMethod: z.enum(["on_site", "stripe"]).default("on_site"),
  })
  .omit({ allowOverlap: true })

export const publicBookingRequestSchema = z.object({
  slug: slugSchema,
  serviceId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  staffId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(5).max(40),
  email: z.email(),
  notes: z.string().trim().max(2000).nullable().optional(),
  locale: z.enum(["hu", "en"]).default("hu"),
  paymentMethod: z.enum(["on_site", "stripe"]).default("on_site"),
})

export const publicCustomerSchema = z.object({
  name: z.string().trim().min(1, "required").max(120),
  phone: z.string().trim().min(5, "required").max(40),
  email: z.email("invalid_email"),
})

export const manageAppointmentSchema = z.object({
  token: z.string().min(32).max(128),
  action: z.enum(["cancel", "reschedule"]),
  startsAt: z.iso.datetime({ offset: true }).optional(),
})

export const serviceSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  durationMinutes: z.number().int().min(5).max(720),
  priceHuf: z.number().int().min(0).max(10_000_000),
  depositHuf: z.number().int().min(0).max(10_000_000).nullable().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
})

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  defaultLocale: z.enum(["hu", "en"]),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  bufferMinutes: z.number().int().min(0).max(240),
  minimumNoticeMinutes: z.number().int().min(0).max(43_200),
  maxDaysAhead: z.number().int().min(1).max(365),
  cancellationWindowHours: z.number().int().min(0).max(720),
  stripeOnline: z.boolean(),
  emailReminder: z.boolean(),
  autoConfirm: z.boolean(),
  bookingDescription: z.string().trim().max(240),
  bookingColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  bookingLogoUrl: z.union([
    z.literal(""),
    z.url().refine((value) => new URL(value).protocol === "https:"),
  ]),
})

const weeklyHourSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  isClosed: z.boolean(),
})

export const teamScheduleSchema = z
  .object({
    memberId: z.uuid(),
    hours: z.array(weeklyHourSchema).length(7),
  })
  .refine(
    (input) =>
      input.hours.every(
        (hour) => hour.isClosed || hour.closesAt > hour.opensAt
      ),
    "invalid_hours"
  )

export const teamTimeOffSchema = z.object({
  memberId: z.uuid().nullable().optional(),
  startDate: z.iso.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endDate: z.iso.date(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reason: z.string().trim().max(160).nullable().optional(),
})

export const teamInviteSchema = z.object({ email: z.email() })

export const timeOffDeleteSchema = z.object({ id: z.uuid() })

export const publicSlotsSchema = z.object({
  slug: slugSchema,
  serviceId: z.uuid(),
  date: z.iso.date(),
  staffId: z.uuid().nullable().optional(),
})

export const setupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema,
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  serviceName: z.string().trim().min(2).max(120),
  durationMinutes: z.number().int().min(5).max(720),
  priceHuf: z.number().int().min(0).max(10_000_000),
})
