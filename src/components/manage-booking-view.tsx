"use client"
import { Button } from "@/components/ui/button"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { LanguageSwitcher } from "@/components/language-switcher"
import { PoweredBy } from "@/components/brand-lockup"

type Booking = { appointment: { serviceId: string; staffId: string; startsAt: string; endsAt: string; status: string; priceHuf: number }; service: { name: string; durationMinutes: number }; organization: { name: string; timezone: string; maxDaysAhead: number }; customer: { name: string }; canModify: boolean }
type Slot = { startsAt: string; endsAt: string; staffId: string }

function dateInZone(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

function plusDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00.000Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export function ManageBookingView({ slug }: { slug: string }) {
  const t = useTranslations("Booking")
  const c = useTranslations("Common")
  const locale = useLocale()
  const query = useSearchParams()
  const token = query.get("token") ?? ""
  const [booking, setBooking] = useState<Booking | null>(null)
  const [date, setDate] = useState("")
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [choosingTime, setChoosingTime] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/public/manage?token=${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("not_found")
      return response.json() as Promise<{ appointment: Booking["appointment"]; service: Booking["service"]; customer: Booking["customer"]; organization: Booking["organization"]; canModify: boolean }>
    }).then((result) => { setBooking(result); setError(false) }).catch(() => setError(true))
  }, [token])

  useEffect(() => {
    if (!booking || !choosingTime) return
    const currentDate = date || dateInZone(booking.organization.timezone)
    const params = new URLSearchParams({ slug, serviceId: booking.appointment.serviceId, date: currentDate, staffId: booking.appointment.staffId })
    fetch(`/api/public/slots?${params.toString()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() as Promise<{ slots: Slot[] }> : { slots: [] }).then((result) => setSlots(result.slots)).catch(() => setSlots([]))
  }, [booking, choosingTime, date, slug])

  async function change(action: "cancel" | "reschedule") {
    if (!booking || !booking.canModify || action === "reschedule" && !selectedSlot) return
    if (action === "cancel" && !window.confirm(t("confirmCancel"))) return
    setBusy(true)
    try {
      const response = await fetch("/api/public/manage", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action, ...(selectedSlot ? { startsAt: selectedSlot.startsAt } : {}) }) })
      if (!response.ok) throw new Error("update_failed")
      setMessage(action === "cancel" ? t("cancelledNotice") : t("rescheduledNotice"))
      if (action === "cancel") setBooking(null)
      else { setChoosingTime(false); setBooking({ ...booking, appointment: { ...booking.appointment, startsAt: selectedSlot!.startsAt, endsAt: selectedSlot!.endsAt } }) }
    } catch { setMessage(t("noLongerAvailable")) } finally { setBusy(false) }
  }

  const formatTime = (value: string) => booking ? new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { timeZone: booking.organization.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : ""
  const formatDate = (value: string) => booking ? new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { timeZone: booking.organization.timezone, dateStyle: "full" }).format(new Date(value)) : ""
  const today = booking ? dateInZone(booking.organization.timezone) : ""
  const maxDate = booking ? plusDays(today, booking.organization.maxDaysAhead) : ""

  return <main className="min-h-svh bg-[#f4f8f6] px-4 py-5 text-[#2c4850] dark:bg-[#13252b] dark:text-white"><div className="mx-auto max-w-xl"><header className="mb-7 flex items-center justify-between"><span className="font-semibold">{booking?.organization.name}</span><LanguageSwitcher compact /></header><section className="rounded-[2rem] border border-[#e1eae6] bg-white p-6 shadow-[0_15px_50px_rgba(45,75,78,.07)] sm:p-9 dark:border-white/10 dark:bg-[#1b3037]"><h1 className="text-3xl font-semibold tracking-tight">{t("manageTitle")}</h1><p className="mt-2 text-base leading-7 text-[#75888b] dark:text-[#b5c4c5]">{t("manageDescription")}</p>{message && <p role="status" className="mt-5 rounded-2xl bg-[#edf5f0] p-4 text-sm font-semibold text-[#4d7d6a] dark:bg-white/10 dark:text-[#c6dfd0]">{message}</p>}{(error || !token) && <p role="alert" className="mt-5 rounded-2xl bg-[#f8efed] p-4 text-sm font-semibold text-[#a65b52]">{t("noLongerAvailable")}</p>}{booking && <><div className="mt-6 rounded-2xl bg-[#f4f8f6] p-4 dark:bg-white/5"><p className="font-semibold">{booking.service.name} · {booking.customer.name}</p><p className="mt-1 text-sm text-[#788b8e]">{formatDate(booking.appointment.startsAt)} · {formatTime(booking.appointment.startsAt)}</p></div>{!booking.canModify ? <p className="mt-5 rounded-2xl bg-[#f6f9f7] p-4 text-sm leading-6 text-[#788b8e] dark:bg-white/5 dark:text-[#b5c4c5]">{t("changeWindowClosed")}</p> : choosingTime ? <div className="mt-5"><label className="block"><span className="mb-2 block text-sm font-semibold">{t("newDate")}</span><input type="date" min={today} max={maxDate} value={date || today} onChange={(event) => { setDate(event.target.value); setSelectedSlot(null) }} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">{slots.map((slot) => <Button key={slot.startsAt} type="button" onClick={() => setSelectedSlot(slot)} aria-pressed={selectedSlot?.startsAt === slot.startsAt} className={`min-h-12 rounded-xl border text-sm font-semibold ${selectedSlot?.startsAt === slot.startsAt ? "border-[#416e7e] bg-[#416e7e] text-white" : "border-[#dce6e3] text-[#54757c] dark:border-white/10 dark:text-white"}`}>{formatTime(slot.startsAt)}</Button>)}</div>{slots.length === 0 && <p className="mt-4 text-sm text-[#788b8e]">{t("noNewSlots")}</p>}<Button type="button" disabled={!selectedSlot || busy} onClick={() => void change("reschedule")} className="mt-5 min-h-14 w-full rounded-full bg-[#416e7e] font-semibold text-white disabled:opacity-50">{busy ? c("loading") : t("saveNewTime")}</Button></div> : <div className="mt-6 space-y-3"><Button type="button" disabled={busy} onClick={() => setChoosingTime(true)} className="min-h-14 w-full rounded-full bg-[#416e7e] font-semibold text-white disabled:opacity-50">{t("rescheduleBooking")}</Button><Button type="button" disabled={busy} onClick={() => void change("cancel")} className="min-h-14 w-full rounded-full border border-[#efd9d4] font-semibold text-[#a65b52] dark:border-white/10 dark:text-[#efb0a5]">{t("cancelBooking")}</Button></div>}</>}</section><footer className="mt-6 text-center"><PoweredBy /></footer></div></main>
}
