"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { addDays } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import { useLocale, useTranslations } from "next-intl"
import type {
  AgendaAppointment,
  ServiceSummary,
  StaffSummary,
} from "@/lib/domain/types"

type Props = {
  initialAppointments: AgendaAppointment[]
  services: ServiceSummary[]
  staffMembers: StaffSummary[]
  currentStaffId: string | null
  canAssignStaff: boolean
  cacheNamespace: string
  today: string
  timezone: string
  demo: boolean
}

type Draft = {
  id?: string
  name: string
  phone: string
  notes: string
  date: string
  time: string
  serviceId: string
  staffId: string
  priceHuf: string
  durationMinutes: number
}

function datePlusDays(date: string, days: number) {
  return addDays(new Date(`${date}T12:00:00.000Z`), days)
    .toISOString()
    .slice(0, 10)
}

function getTime(date: Date, timezone: string) {
  return formatInTimeZone(date, timezone, "HH:mm")
}

function getLocalDate(date: Date, timezone: string) {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd")
}

function formatMoney(amount: number, locale: string) {
  return new Intl.NumberFormat(locale === "hu" ? "hu-HU" : "en-GB", {
    style: "currency",
    currency: "HUF",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function AgendaView({
  initialAppointments,
  services,
  staffMembers,
  currentStaffId,
  canAssignStaff,
  cacheNamespace,
  today,
  timezone,
  demo,
}: Props) {
  const t = useTranslations("Agenda")
  const q = useTranslations("QuickAdd")
  const team = useTranslations("Team")
  const common = useTranslations("Common")
  const navigation = useTranslations("Navigation")
  const locale = useLocale()
  const [selectedDate, setSelectedDate] = useState(today)
  const [appointments, setAppointments] = useState(initialAppointments)
  const [view, setView] = useState<"day" | "week">("day")
  const [online, setOnline] = useState(true)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [detail, setDetail] = useState<AgendaAppointment | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [overlapPrompt, setOverlapPrompt] = useState(false)

  const storageKey = useMemo(
    () => `tempo-agenda:${cacheNamespace}:${selectedDate}`,
    [cacheNamespace, selectedDate]
  )

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    updateOnline()
    window.addEventListener("online", updateOnline)
    window.addEventListener("offline", updateOnline)
    return () => {
      window.removeEventListener("online", updateOnline)
      window.removeEventListener("offline", updateOnline)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const cacheTimer = window.setTimeout(() => {
      const cached = window.localStorage.getItem(storageKey)
      if (cached) {
        try {
          setAppointments(JSON.parse(cached) as AgendaAppointment[])
        } catch {
          window.localStorage.removeItem(storageKey)
        }
      } else {
        setAppointments(selectedDate === today ? initialAppointments : [])
      }
    }, 0)
    if (!navigator.onLine) return () => window.clearTimeout(cacheTimer)
    fetch(`/api/agenda?date=${encodeURIComponent(selectedDate)}`, {
      cache: "no-store",
    })
      .then(async (response) =>
        response.ok
          ? (response.json() as Promise<{ appointments: AgendaAppointment[] }>)
          : null
      )
      .then((data) => {
        if (data && !cancelled) setAppointments(data.appointments)
      })
      .catch(() => undefined)
    if (selectedDate === today) {
      const tomorrow = datePlusDays(today, 1)
      fetch(`/api/agenda?date=${encodeURIComponent(tomorrow)}`, {
        cache: "no-store",
      })
        .then(async (response) =>
          response.ok
            ? (response.json() as Promise<{ appointments: AgendaAppointment[] }>)
            : null
        )
        .then((data) => {
          if (data && !cancelled) {
            window.localStorage.setItem(
              `tempo-agenda:${cacheNamespace}:${tomorrow}`,
              JSON.stringify(data.appointments)
            )
          }
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
      window.clearTimeout(cacheTimer)
    }
  }, [cacheNamespace, initialAppointments, selectedDate, storageKey, today])

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(appointments))
  }, [appointments, storageKey])

  const openAdd = useCallback(
    (time?: string, staffId?: string) => {
      const now = new Date()
      const todayIsSelected = selectedDate === getLocalDate(now, timezone)
      const currentMinutes =
        Number(getTime(now, timezone).slice(0, 2)) * 60 +
        Number(getTime(now, timezone).slice(3, 5))
      const nextMinutes = Math.ceil(currentMinutes / 15) * 15
      const defaultTime =
        todayIsSelected && nextMinutes >= 9 * 60 && nextMinutes < 18 * 60
          ? `${String(Math.floor(nextMinutes / 60)).padStart(2, "0")}:${String(nextMinutes % 60).padStart(2, "0")}`
          : "09:00"
      const defaultService =
        services.find((service) => service.isDefault && service.isActive) ??
        services.find((service) => service.isActive)
      setMessage("")
      setDraft({
        name: "",
        phone: "",
        notes: "",
        date: selectedDate,
        time: time ?? defaultTime,
        serviceId: defaultService?.id ?? "",
        staffId: staffId ?? currentStaffId ?? "",
        priceHuf: defaultService?.priceHuf
          ? String(defaultService.priceHuf)
          : "",
        durationMinutes: defaultService?.durationMinutes ?? 30,
      })
    },
    [currentStaffId, selectedDate, services, timezone]
  )

  function editAppointment(appointment: AgendaAppointment) {
    const service = services.find(
      (item) => item.name === appointment.serviceName
    )
    setDetail(null)
    setDraft({
      id: appointment.id,
      name: appointment.customerName,
      phone: appointment.phone ?? "",
      notes: appointment.notes ?? "",
      date: getLocalDate(new Date(appointment.startsAt), timezone),
      time: getTime(new Date(appointment.startsAt), timezone),
      serviceId: service?.id ?? "",
      staffId: appointment.staffId ?? currentStaffId ?? "",
      priceHuf: appointment.priceHuf ? String(appointment.priceHuf) : "",
      durationMinutes: appointment.durationMinutes,
    })
  }

  async function saveDraft(allowOverlap = false) {
    if (!draft?.name.trim() || !draft.date || !draft.time) {
      setMessage(q("required"))
      return
    }
    const service = services.find((item) => item.id === draft.serviceId)
    const payload = {
      name: draft.name.trim(),
      phone: draft.phone.trim() || null,
      notes: draft.notes.trim() || null,
      date: draft.date,
      time: draft.time,
      serviceId: draft.serviceId || null,
      priceHuf: Number(draft.priceHuf || service?.priceHuf || 0),
      durationMinutes: service?.durationMinutes ?? draft.durationMinutes,
      staffId: draft.staffId || null,
      allowOverlap,
    }
    setSaving(true)
    setMessage("")
    try {
      const response = await fetch(
        draft.id ? `/api/appointments/${draft.id}` : "/api/appointments",
        {
          method: draft.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      if (response.status === 409 && !allowOverlap) {
        setOverlapPrompt(true)
        setSaving(false)
        return
      }
      if (response.ok) {
        const result = (await response.json()) as {
          appointment?: AgendaAppointment
        }
        if (result.appointment) {
          setAppointments((current) =>
            [
              ...current.filter((item) => item.id !== result.appointment?.id),
              result.appointment!,
            ].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          )
          setSelectedDate(payload.date)
          setDraft(null)
          setMessage(q("saved"))
          setSaving(false)
          return
        }
      }
      setMessage(q("saveError"))
    } catch {
      setOnline(navigator.onLine)
      setMessage(q("saveError"))
    }
    setSaving(false)
  }

  async function updateAppointment(
    appointment: AgendaAppointment,
    action: "paid" | "cancel"
  ) {
    const updated =
      action === "paid"
        ? { ...appointment, isPaid: true }
        : { ...appointment, status: "cancelled" as const }
    try {
      const response = await fetch(`/api/appointments/${appointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      if (!response.ok) {
        setMessage(q("saveError"))
        return
      }
      setAppointments((current) =>
        action === "cancel"
          ? current.filter((item) => item.id !== appointment.id)
          : current.map((item) => (item.id === appointment.id ? updated : item))
      )
      setDetail(null)
    } catch {
      setOnline(navigator.onLine)
      setMessage(q("saveError"))
    }
  }

  const visibleAppointments = appointments
    .filter((appointment) => appointment.status !== "cancelled")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const dayLabel = new Intl.DateTimeFormat(
    locale === "hu" ? "hu-HU" : "en-GB",
    { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }
  ).format(new Date(`${selectedDate}T12:00:00.000Z`))
  const dayCount = visibleAppointments.length

  const weekDays = Array.from({ length: 7 }, (_, index) =>
    datePlusDays(selectedDate, index - 3)
  )
  const weekDayLabel = (date: string) =>
    new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", {
      timeZone: "UTC",
      weekday: "short",
    }).format(new Date(`${date}T12:00:00.000Z`))
  const hours = Array.from({ length: 40 }, (_, index) => 8 * 60 + index * 15)
  const staffColumns =
    staffMembers.length > 0
      ? staffMembers
      : [{ id: currentStaffId ?? "", name: "" }]
  const agendaGrid = {
    gridTemplateColumns: `4rem repeat(${staffColumns.length}, minmax(150px, 1fr))`,
  }

  return (
    <section data-demo={demo} className="mx-auto max-w-5xl">
      <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#698083] dark:text-[#a9bbbb]">
            <span
              className={`size-2 rounded-full ${online ? "bg-[#77a594]" : "bg-[#daa36f]"}`}
            />
            {online ? t("online") : t("offline")}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#263f49] sm:text-4xl dark:text-white">
            {t("title")}
          </h1>
          <p className="mt-2 text-base text-[#76898d] dark:text-[#b4c2c4]">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-[#dfe8e5] bg-white p-1 dark:border-white/10 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setView("day")}
              aria-pressed={view === "day"}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${view === "day" ? "bg-[#eaf2ef] text-[#416d76] dark:bg-white/10 dark:text-white" : "text-[#7c8c8d]"}`}
            >
              {navigation("today")}
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              aria-pressed={view === "week"}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${view === "week" ? "bg-[#eaf2ef] text-[#416d76] dark:bg-white/10 dark:text-white" : "text-[#7c8c8d]"}`}
            >
              {navigation("week")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => openAdd()}
            className="hidden min-h-12 items-center gap-2 rounded-full bg-[#416e7e] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#355f6d] sm:inline-flex"
          >
            <span className="text-xl" aria-hidden="true">
              +
            </span>
            {t("addAppointment")}
          </button>
        </div>
      </div>

      <div className="mb-5 rounded-[1.6rem] border border-[#e3ebe8] bg-white p-4 shadow-[0_4px_20px_rgba(45,75,78,.035)] sm:p-6 dark:border-white/10 dark:bg-[#1b3037]">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              setSelectedDate((date) =>
                datePlusDays(date, view === "week" ? -7 : -1)
              )
            }
            className="flex size-11 items-center justify-center rounded-full border border-[#e5ece9] text-lg text-[#5d777b] hover:bg-[#f2f6f4] dark:border-white/10 dark:text-white dark:hover:bg-white/5"
            aria-label={t("previousDay")}
          >
            ‹
          </button>
          <div className="text-center">
            <div className="text-lg font-semibold text-[#304a52] capitalize dark:text-white">
              {dayLabel}
            </div>
            <div className="mt-1 text-sm text-[#7e8f91]">
              {dayCount}{" "}
              {t("todayCount").toLocaleLowerCase(
                locale === "hu" ? "hu-HU" : "en-GB"
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setSelectedDate((date) =>
                datePlusDays(date, view === "week" ? 7 : 1)
              )
            }
            className="flex size-11 items-center justify-center rounded-full border border-[#e5ece9] text-lg text-[#5d777b] hover:bg-[#f2f6f4] dark:border-white/10 dark:text-white dark:hover:bg-white/5"
            aria-label={t("nextDay")}
          >
            ›
          </button>
        </div>
        {view === "week" && (
          <div className="mb-5 grid grid-cols-7 gap-1 rounded-2xl bg-[#f6f9f7] p-1 dark:bg-white/5">
            {weekDays.map((date) => (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
                className={`min-h-[60px] rounded-xl text-center transition ${date === selectedDate ? "bg-[#416e7e] text-white shadow-sm" : "text-[#718386] hover:bg-white dark:text-[#b8c5c7] dark:hover:bg-white/5"}`}
              >
                <span className="block text-xs">{weekDayLabel(date)}</span>
                <span className="mt-1 block text-sm font-semibold">
                  {date.slice(-2)}
                </span>
              </button>
            ))}
          </div>
        )}

        {visibleAppointments.length === 0 && (
          <div className="mb-5 rounded-2xl bg-[#f7faf8] px-5 py-6 text-center dark:bg-white/5">
            <div
              className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-white text-xl text-[#6f9690] shadow-sm dark:bg-white/10"
              aria-hidden="true"
            >
              ◷
            </div>
            <h2 className="font-semibold text-[#39555c] dark:text-white">
              {t("emptyTitle")}
            </h2>
            <p className="mt-1 text-sm text-[#7e8f91]">{t("emptyText")}</p>
          </div>
        )}

        {staffColumns.length > 1 && (
          <div className="mb-2 overflow-x-auto">
            <div className="grid gap-2 pb-2" style={agendaGrid}>
              <span />
              {staffColumns.map((staff) => (
                <span
                  key={staff.id}
                  className="truncate px-3 text-sm font-semibold text-[#58757b] dark:text-[#c2d3d3]"
                >
                  {staff.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <div
            className="space-y-0"
            style={{
              minWidth:
                staffColumns.length > 1
                  ? `${4 * 16 + staffColumns.length * 150}px`
                  : undefined,
            }}
          >
            {hours.map((minutes) => {
              const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
              const rowAppointments = visibleAppointments.filter(
                (item) =>
                  getLocalDate(new Date(item.startsAt), timezone) ===
                    selectedDate &&
                  getTime(new Date(item.startsAt), timezone) === time
              )
              return (
                <div
                  key={time}
                  className="grid min-h-[60px] gap-2"
                  style={agendaGrid}
                >
                  <div
                    className={`border-t border-dashed border-[#e7edeb] pt-2 text-xs tabular-nums ${rowAppointments.length ? "font-semibold text-[#577a82] dark:text-[#c0d6d4]" : "text-[#99a5a5]"}`}
                  >
                    {time}
                  </div>
                  {staffColumns.map((staff, staffIndex) => {
                    const appointment =
                      rowAppointments.find(
                        (item) => item.staffId === staff.id
                      ) ??
                      (staffIndex === 0
                        ? rowAppointments.find((item) => !item.staffId)
                        : undefined)
                    return (
                      <div
                        key={`${time}:${staff.id}`}
                        className="relative border-t border-dashed border-[#e7edeb] dark:border-white/10"
                      >
                        {appointment ? (
                          <button
                            type="button"
                            onClick={() => setDetail(appointment)}
                            className="relative -mt-2 flex min-h-[58px] w-full items-center gap-3 rounded-2xl border border-[#dfeae5] bg-[#f0f6f2] px-3 py-2 text-left transition hover:border-[#b8d0c7] hover:bg-[#eaf2ed] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none dark:border-white/10 dark:bg-[#263e3e] dark:hover:bg-[#2c4847]"
                          >
                            <span className="absolute top-3 bottom-3 left-0 w-1 rounded-full bg-[#6f9b8b]" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-base font-semibold text-[#34545b] dark:text-white">
                                {appointment.customerName}
                              </span>
                              <span className="mt-1 block truncate text-sm text-[#788e8c] dark:text-[#bfd0cb]">
                                {appointment.serviceName ?? common("noService")}{" "}
                                · {appointment.durationMinutes} {common("min")}
                              </span>
                            </span>
                            <span className="hidden text-sm font-medium text-[#708883] sm:block">
                              {formatMoney(appointment.priceHuf, locale)}
                            </span>
                            {appointment.isPaid && (
                              <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-[#5a8271] dark:bg-black/10 dark:text-[#c9e0d3]">
                                {t("paid")}
                              </span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openAdd(time, staff.id)}
                            className="group flex min-h-[58px] w-full items-center justify-between rounded-xl px-2 text-left focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                          >
                            <span
                              className="text-xs text-transparent transition group-hover:text-[#9aa9a7] group-focus-visible:text-[#718989]"
                              aria-hidden="true"
                            >
                              {t("available")}
                            </span>
                            <span className="flex size-8 items-center justify-center rounded-full text-lg text-transparent transition group-hover:bg-[#edf4f0] group-hover:text-[#5d8983] group-focus-visible:bg-[#edf4f0] group-focus-visible:text-[#5d8983] dark:group-hover:bg-white/5">
                              +
                            </span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {message && (
        <div
          role="status"
          className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#294d55] px-5 py-3 text-sm font-medium text-white shadow-lg lg:bottom-8"
        >
          {message}
        </div>
      )}
      <button
        type="button"
        onClick={() => openAdd()}
        aria-label={t("addAppointment")}
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+5.8rem)] z-30 flex size-16 items-center justify-center rounded-full bg-[#416e7e] text-3xl font-light text-white shadow-[0_10px_28px_rgba(41,87,100,.35)] transition hover:scale-105 focus-visible:ring-4 focus-visible:ring-[#91b4bb]/50 focus-visible:outline-none sm:right-8 lg:right-10 lg:bottom-8"
      >
        <span aria-hidden="true">+</span>
      </button>

      {draft && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#172a31]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-5"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDraft(null)
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-add-title"
            onSubmit={(event) => {
              event.preventDefault()
              void saveDraft()
            }}
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem] sm:p-7 dark:bg-[#1b3037]"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2
                  id="quick-add-title"
                  className="text-2xl font-semibold tracking-tight text-[#2c4850] dark:text-white"
                >
                  {draft.id ? q("title") : q("title")}
                </h2>
                <p className="mt-1 text-sm text-[#829193]">{q("pastNotice")}</p>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="flex size-11 items-center justify-center rounded-full bg-[#f1f5f3] text-xl text-[#6a8083] dark:bg-white/5 dark:text-white"
                aria-label={common("close")}
              >
                ×
              </button>
            </div>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                  {q("name")} <span aria-hidden="true">*</span>
                </span>
                <input
                  autoFocus
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder={q("namePlaceholder")}
                  className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base outline-none placeholder:text-[#a4afae] focus:border-[#6492a0] focus:ring-3 focus:ring-[#6492a0]/15 dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                    {q("date")}
                  </span>
                  <input
                    type="date"
                    required
                    value={draft.date}
                    onChange={(event) =>
                      setDraft({ ...draft, date: event.target.value })
                    }
                    className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                    {q("time")}
                  </span>
                  <input
                    type="time"
                    step={900}
                    required
                    value={draft.time}
                    onChange={(event) =>
                      setDraft({ ...draft, time: event.target.value })
                    }
                    className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                  />
                </label>
              </div>
              <details className="rounded-2xl border border-[#e3ebe8] px-4 py-3 dark:border-white/10">
                <summary className="min-h-8 cursor-pointer py-1 text-sm font-semibold text-[#607b80] dark:text-[#c4d1d1]">
                  {q("advanced")}
                </summary>
                <div className="mt-4 space-y-4">
                  {canAssignStaff && staffMembers.length > 1 && (
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                        {team("member")}
                      </span>
                      <select
                        value={draft.staffId}
                        onChange={(event) =>
                          setDraft({ ...draft, staffId: event.target.value })
                        }
                        className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                      >
                        {staffMembers.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                      {q("service")}
                    </span>
                    <select
                      value={draft.serviceId}
                      onChange={(event) => {
                        const service = services.find(
                          (item) => item.id === event.target.value
                        )
                        setDraft({
                          ...draft,
                          serviceId: event.target.value,
                          durationMinutes: service?.durationMinutes ?? 30,
                          priceHuf: service?.priceHuf
                            ? String(service.priceHuf)
                            : "",
                        })
                      }}
                      className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                    >
                      <option value="">{q("noService")}</option>
                      {services.map((service) => (
                        <option key={service.id} value={service.id}>
                          {service.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                        {q("duration")}
                      </span>
                      <input
                        type="number"
                        min={5}
                        max={720}
                        step={5}
                        value={draft.durationMinutes}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            durationMinutes: Number(event.target.value),
                          })
                        }
                        className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                        {q("price")}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={500}
                        value={draft.priceHuf}
                        onChange={(event) =>
                          setDraft({ ...draft, priceHuf: event.target.value })
                        }
                        className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                      {q("phone")}
                    </span>
                    <input
                      type="tel"
                      value={draft.phone}
                      onChange={(event) =>
                        setDraft({ ...draft, phone: event.target.value })
                      }
                      className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-[#405a60] dark:text-[#dce8e6]">
                      {q("notes")}
                    </span>
                    <textarea
                      rows={2}
                      value={draft.notes}
                      onChange={(event) =>
                        setDraft({ ...draft, notes: event.target.value })
                      }
                      placeholder={q("notesPlaceholder")}
                      className="w-full rounded-2xl border border-[#dce6e3] bg-white px-4 py-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                    />
                  </label>
                </div>
              </details>
            </div>
            {message && (
              <p
                role="alert"
                className="mt-4 text-sm font-medium text-[#ad5f55]"
              >
                {message}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="min-h-14 flex-1 rounded-full border border-[#dce6e3] px-5 font-semibold text-[#668084] dark:border-white/10 dark:text-[#c4d1d1]"
              >
                {q("cancel")}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-14 flex-[1.6] rounded-full bg-[#416e7e] px-5 font-semibold text-white shadow-sm disabled:opacity-60"
              >
                {saving ? q("saving") : q("save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {overlapPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#172a31]/55 p-5">
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl dark:bg-[#1b3037]"
          >
            <p className="text-lg font-semibold text-[#304a52] dark:text-white">
              {q("overlap")}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setOverlapPrompt(false)}
                className="min-h-12 flex-1 rounded-full border border-[#dce6e3] font-semibold text-[#668084] dark:border-white/10 dark:text-white"
              >
                {q("cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverlapPrompt(false)
                  void saveDraft(true)
                }}
                className="min-h-12 flex-1 rounded-full bg-[#416e7e] font-semibold text-white"
              >
                {q("confirmOverlap")}
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#172a31]/45 p-0 sm:items-center sm:p-5"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDetail(null)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-detail-title"
            className="w-full max-w-md rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem] dark:bg-[#1b3037]"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-[#789092]">
                  {getTime(new Date(detail.startsAt), timezone)} ·{" "}
                  {detail.durationMinutes} {common("min")}
                </p>
                <h2
                  id="appointment-detail-title"
                  className="mt-2 text-2xl font-semibold text-[#304a52] dark:text-white"
                >
                  {detail.customerName}
                </h2>
                <p className="mt-1 text-[#718487] dark:text-[#b8c5c6]">
                  {detail.serviceName ?? common("noService")} ·{" "}
                  {formatMoney(detail.priceHuf, locale)}
                </p>
                {detail.phone && (
                  <a
                    href={`tel:${detail.phone}`}
                    className="mt-3 inline-block text-sm font-medium text-[#477789]"
                  >
                    {detail.phone}
                  </a>
                )}
                {detail.notes && (
                  <p className="mt-3 rounded-xl bg-[#f4f8f6] p-3 text-sm text-[#647b7e] dark:bg-white/5 dark:text-[#bdc9c9]">
                    {detail.notes}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="flex size-11 items-center justify-center rounded-full bg-[#f1f5f3] text-xl dark:bg-white/5"
                aria-label={common("close")}
              >
                ×
              </button>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => editAppointment(detail)}
                className="min-h-12 rounded-full border border-[#dce6e3] px-4 text-sm font-semibold text-[#607b80] dark:border-white/10 dark:text-white"
              >
                {t("edit")}
              </button>
              <button
                type="button"
                onClick={() => editAppointment(detail)}
                className="min-h-12 rounded-full border border-[#dce6e3] px-4 text-sm font-semibold text-[#607b80] dark:border-white/10 dark:text-white"
              >
                {t("move")}
              </button>
              {!detail.isPaid && (
                <button
                  type="button"
                  onClick={() => void updateAppointment(detail, "paid")}
                  className="min-h-12 rounded-full bg-[#eaf3ed] px-4 text-sm font-semibold text-[#4d7d6a] dark:bg-white/10 dark:text-[#c6dfd0]"
                >
                  {t("markPaid")}
                </button>
              )}
              <button
                type="button"
                onClick={() => void updateAppointment(detail, "cancel")}
                className="min-h-12 rounded-full border border-[#efd9d4] px-4 text-sm font-semibold text-[#a65b52] dark:border-white/10 dark:text-[#efb0a5]"
              >
                {t("cancel")}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
