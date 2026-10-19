import { addMinutes, differenceInCalendarDays, parseISO } from "date-fns"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

export type LocalWorkingHours = {
  weekday: number
  opensAt: string
  closesAt: string
  isClosed?: boolean
  memberId?: string | null
}

export type BusyInterval = { startsAt: string; endsAt: string }
export type AvailableSlot = { startsAt: string; endsAt: string }

export type CalculateSlotsInput = {
  date: string
  timezone: string
  durationMinutes: number
  bufferMinutes?: number
  minimumNoticeMinutes?: number
  maxDaysAhead?: number
  slotIntervalMinutes?: number
  now?: Date
  workingHours: LocalWorkingHours[]
  timeOff?: BusyInterval[]
  appointments?: BusyInterval[]
}

function minutesSinceMidnight(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":")
  return Number(hours) * 60 + Number(minutes)
}

function localDateString(date: Date, timezone: string) {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd")
}

function overlaps(start: number, end: number, interval: BusyInterval) {
  return start < new Date(interval.endsAt).getTime() && end > new Date(interval.startsAt).getTime()
}

export function calculateAvailableSlots(input: CalculateSlotsInput): AvailableSlot[] {
  const {
    date, timezone, durationMinutes, bufferMinutes = 0, minimumNoticeMinutes = 0,
    maxDaysAhead = 365, slotIntervalMinutes = 15, now = new Date(),
    workingHours, timeOff = [], appointments = [],
  } = input

  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0 || slotIntervalMinutes <= 0) return []
  const dayDate = parseISO(`${date}T12:00:00`)
  const weekday = dayDate.getUTCDay()
  const weekdayHours = workingHours.find((item) => item.weekday === weekday && !item.isClosed)
  if (!weekdayHours) return []
  const opensAt = minutesSinceMidnight(weekdayHours.opensAt)
  const closesAt = minutesSinceMidnight(weekdayHours.closesAt)
  if (closesAt <= opensAt) return []

  const daysAhead = differenceInCalendarDays(parseISO(`${date}T12:00:00`), parseISO(`${localDateString(now, timezone)}T12:00:00`))
  if (daysAhead < 0 || daysAhead > maxDaysAhead) return []

  const earliestStart = now.getTime() + minimumNoticeMinutes * 60_000
  const slots: AvailableSlot[] = []

  for (let localMinute = opensAt; localMinute + durationMinutes <= closesAt; localMinute += slotIntervalMinutes) {
    const hours = String(Math.floor(localMinute / 60)).padStart(2, "0")
    const minutes = String(localMinute % 60).padStart(2, "0")
    const localStart = `${date}T${hours}:${minutes}:00`
    const start = fromZonedTime(localStart, timezone)
    if (formatInTimeZone(start, timezone, "yyyy-MM-dd'T'HH:mm:ss") !== localStart) continue

    const end = addMinutes(start, durationMinutes)
    const endLocalDate = localDateString(end, timezone)
    const endLocalTime = formatInTimeZone(end, timezone, "HH:mm")
    const endLocalMinute = minutesSinceMidnight(endLocalTime)
    if (endLocalDate !== date || endLocalMinute > closesAt || start.getTime() < earliestStart) continue

    const bufferedStart = start.getTime() - bufferMinutes * 60_000
    const bufferedEnd = end.getTime() + bufferMinutes * 60_000
    if (timeOff.some((interval) => overlaps(bufferedStart, bufferedEnd, interval))) continue
    if (appointments.some((interval) => overlaps(bufferedStart, bufferedEnd, interval))) continue
    slots.push({ startsAt: start.toISOString(), endsAt: end.toISOString() })
  }

  return slots
}
