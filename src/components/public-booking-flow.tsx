"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocale, useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { LanguageSwitcher } from "@/components/language-switcher"
import { PoweredBy } from "@/components/brand-lockup"
import type { PublicTenant } from "@/lib/server/public-booking"
import { publicCustomerSchema } from "@/lib/validation"
import type { z } from "zod"

type CustomerFields = z.infer<typeof publicCustomerSchema>
type Slot = { startsAt: string; endsAt: string; staffId: string }

function localDateInTimeZone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`
}

function addDays(date: string, days: number) {
  const result = new Date(`${date}T12:00:00.000Z`)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString().slice(0, 10)
}

function readableOnColor(hex: string) {
  const value = Number.parseInt(hex.replace("#", ""), 16)
  const channel = (shift: number) => {
    const part = ((value >> shift) & 255) / 255
    return part <= 0.04045 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
  return luminance > 0.179 ? "#263f49" : "#ffffff"
}

export function PublicBookingFlow({ tenant }: { tenant: PublicTenant }) {
  const t = useTranslations("Booking")
  const q = useTranslations("QuickAdd")
  const common = useTranslations("Common")
  const locale = useLocale()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(0)
  const [serviceId, setServiceId] = useState(tenant.services[0]?.id ?? "")
  const [date, setDate] = useState(() => localDateInTimeZone(tenant.timezone))
  const [staffChoice, setStaffChoice] = useState("")
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [loadedQuery, setLoadedQuery] = useState("")
  const [paymentMethod, setPaymentMethod] = useState<"on_site" | "stripe">(
    "on_site"
  )
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [bookingResult, setBookingResult] = useState<{
    manageUrl: string
    name: string
  } | null>(null)
  const queryKey = `${tenant.slug}:${serviceId}:${date}:${staffChoice}`
  const paymentToken = searchParams.get("token")
  const returnedBooking =
    searchParams.get("booking") && searchParams.get("payment") === "success"
      ? {
          manageUrl: paymentToken
            ? `/manage?token=${encodeURIComponent(paymentToken)}`
            : "/",
          name: "",
        }
      : null
  const visibleBookingResult = bookingResult ?? returnedBooking
  const visibleError =
    error ||
    (searchParams.get("payment") === "cancelled" ? t("paymentCancelled") : "")
  const loadingSlots =
    step === 1 && Boolean(serviceId) && loadedQuery !== queryKey
  const minDate = useMemo(
    () => localDateInTimeZone(tenant.timezone),
    [tenant.timezone]
  )
  const maxDate = useMemo(
    () => addDays(minDate, tenant.settings.booking.max_days_ahead),
    [minDate, tenant.settings.booking.max_days_ahead]
  )
  const selectedService = tenant.services.find(
    (service) => service.id === serviceId
  )
  const showOnlinePayment =
    tenant.settings.payments.stripe_online &&
    tenant.stripeConnectEnabled &&
    Boolean(tenant.stripeAccountId)
  const showPaymentChoice =
    tenant.settings.payments.on_site && showOnlinePayment

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerFields>({
    resolver: zodResolver(publicCustomerSchema),
    defaultValues: { name: "", phone: "", email: "" },
  })

  useEffect(() => {
    if (!serviceId || step !== 1) return
    let stopped = false
    const query = new URLSearchParams({ slug: tenant.slug, serviceId, date })
    if (staffChoice) query.set("staffId", staffChoice)
    fetch(`/api/public/slots?${query.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return { slots: [] }
        return response.json() as Promise<{ slots: Slot[] }>
      })
      .then((result) => {
        if (!stopped) {
          setSlots(result.slots)
          setLoadedQuery(queryKey)
        }
      })
      .catch(() => {
        if (!stopped) {
          setSlots([])
          setLoadedQuery(queryKey)
        }
      })
    return () => {
      stopped = true
    }
  }, [date, queryKey, serviceId, staffChoice, step, tenant.slug])

  async function confirmBooking(fields: CustomerFields) {
    if (!selectedService || !selectedSlot) return
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: tenant.slug,
          serviceId: selectedService.id,
          startsAt: selectedSlot.startsAt,
          staffId: selectedSlot.staffId,
          ...fields,
          locale,
          paymentMethod,
        }),
      })
      const result = (await response.json()) as {
        error?: string
        checkoutUrl?: string | null
        manageUrl?: string
      }
      if (!response.ok) throw new Error(result.error ?? "booking_failed")
      if (result.checkoutUrl) {
        window.location.assign(result.checkoutUrl)
        return
      }
      setBookingResult({
        manageUrl: result.manageUrl ?? "/manage",
        name: fields.name,
      })
    } catch {
      setError(t("error"))
    } finally {
      setBusy(false)
    }
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(`${value}T12:00:00.000Z`))
  const formatTime = (value: string) =>
    new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", {
      timeZone: tenant.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value))
  const money = (value: number) =>
    new Intl.NumberFormat(locale === "hu" ? "hu-HU" : "en-GB", {
      style: "currency",
      currency: "HUF",
      maximumFractionDigits: 0,
    }).format(value)
  const stepNames = [t("serviceStep"), t("timeStep"), t("detailsStep")]
  const inputClass =
    "min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base outline-none focus:border-[#6492a0] focus:ring-3 focus:ring-[#6492a0]/15 dark:border-white/10 dark:bg-[#20373e] dark:text-white"

  return (
    <main
      style={
        {
          "--tempo-primary": tenant.appearance.color,
          "--tempo-on-primary": readableOnColor(tenant.appearance.color),
        } as React.CSSProperties
      }
      className="min-h-svh bg-[#f4f8f6] px-4 py-5 text-[#2c4850] sm:px-6 sm:py-8 dark:bg-[#13252b] dark:text-white"
    >
      <div className="mx-auto max-w-2xl">
        <header className="mb-7 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {tenant.appearance.logoUrl ? (
              <Image
                src={tenant.appearance.logoUrl}
                alt={tenant.name}
                width={48}
                height={48}
                unoptimized
                className="size-12 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-semibold"
                style={{
                  backgroundColor: tenant.appearance.color,
                  color: readableOnColor(tenant.appearance.color),
                }}
                aria-hidden="true"
              >
                {tenant.name.charAt(0)}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight">
                {tenant.name}
              </h1>
              <p className="mt-1 text-sm text-[#7a8c8e] dark:text-[#afc0c2]">
                {tenant.appearance.description || t("businessTitle")}
              </p>
            </div>
          </div>
          <LanguageSwitcher compact />
        </header>
        {visibleBookingResult ? (
          <section className="rounded-[2rem] border border-[#e1eae6] bg-white p-6 text-center shadow-[0_15px_50px_rgba(45,75,78,.07)] sm:p-10 dark:border-white/10 dark:bg-[#1b3037]">
            <span
              className="mx-auto flex size-16 items-center justify-center rounded-3xl bg-[#e9f3ed] text-3xl text-[#58836e] dark:bg-white/10 dark:text-[#c1ddca]"
              aria-hidden="true"
            >
              ✓
            </span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">
              {t("successTitle")}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base leading-7 text-[#75888b] dark:text-[#b5c4c5]">
              {t("successText")}
            </p>
            {visibleBookingResult.name && (
              <p className="mt-4 font-semibold">{visibleBookingResult.name}</p>
            )}
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href={visibleBookingResult.manageUrl}
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#dce6e3] px-6 text-sm font-semibold text-[#5b777d] dark:border-white/10 dark:text-white"
              >
                {t("manageAppointment")}
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[var(--tempo-primary)] px-6 text-sm font-semibold text-[var(--tempo-on-primary)]"
              >
                {t("chooseService")}
              </Link>
            </div>
            <p className="mt-7 text-sm text-[#829193]">{t("privacy")}</p>
          </section>
        ) : (
          <section className="rounded-[2rem] border border-[#e1eae6] bg-white p-5 shadow-[0_15px_50px_rgba(45,75,78,.07)] sm:p-8 dark:border-white/10 dark:bg-[#1b3037]">
            <div
              className="mb-7 grid grid-cols-3 gap-2"
              aria-label={`${t("step")} ${step + 1} ${t("of")} 3`}
            >
              {stepNames.map((name, index) => (
                <div key={name} className="space-y-2">
                  <span
                    className={`block h-1.5 rounded-full ${index <= step ? "bg-[#5f8d8d]" : "bg-[#e4ece8] dark:bg-white/10"}`}
                  />
                  <span
                    className={`block text-xs font-medium ${index === step ? "text-[#4d747b] dark:text-[#d2e2e0]" : "text-[#8b9999]"}`}
                  >
                    {name}
                  </span>
                </div>
              ))}
            </div>

            {step === 0 && (
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t("chooseService")}
                </h2>
                <div className="mt-5 space-y-3">
                  {tenant.services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => {
                        setServiceId(service.id)
                        setSelectedSlot(null)
                      }}
                      aria-pressed={serviceId === service.id}
                      className={`flex min-h-[82px] w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition ${serviceId === service.id ? "border-[#6c9a99] bg-[#eff6f2] ring-2 ring-[#6c9a99]/20 dark:bg-[#294342]" : "border-[#e4ebe8] hover:bg-[#f8faf9] dark:border-white/10 dark:hover:bg-white/5"}`}
                    >
                      <span>
                        <span className="block text-base font-semibold">
                          {service.name}
                        </span>
                        <span className="mt-1 block text-sm text-[#7e8e90]">
                          {service.durationMinutes} {common("min")}
                        </span>
                      </span>
                      <span className="font-semibold text-[#537981] dark:text-[#c1d7d7]">
                        {money(service.priceHuf)}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-7 flex justify-end">
                  <button
                    type="button"
                    disabled={!selectedService}
                    onClick={() => setStep(1)}
                    className="min-h-14 w-full rounded-full bg-[var(--tempo-primary)] px-7 font-semibold text-[var(--tempo-on-primary)] disabled:opacity-50 sm:w-auto"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t("chooseTime")}
                </h2>
                {tenant.staff.length > 1 && (
                  <label className="mt-5 block">
                    <span className="mb-2 block text-sm font-semibold">
                      {t("anyone")}
                    </span>
                    <select
                      value={staffChoice}
                      onChange={(event) => {
                        setStaffChoice(event.target.value)
                        setSelectedSlot(null)
                      }}
                      className={inputClass}
                    >
                      <option value="">{t("anyone")}</option>
                      {tenant.staff.map((staff) => (
                        <option key={staff.id} value={staff.id}>
                          {staff.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="mt-5 block">
                  <span className="mb-2 block text-sm font-semibold">
                    {t("date")}
                  </span>
                  <input
                    type="date"
                    min={minDate}
                    max={maxDate}
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value)
                      setSelectedSlot(null)
                    }}
                    className={inputClass}
                  />
                </label>
                <div className="mt-5">
                  <h3 className="mb-3 text-sm font-semibold text-[#607a7d] dark:text-[#d2dfdd]">
                    {t("selectTime")}
                  </h3>
                  {loadingSlots ? (
                    <p className="py-5 text-sm text-[#829193]">
                      {common("loading")}
                    </p>
                  ) : slots.length === 0 ? (
                    <p className="rounded-2xl bg-[#f5f8f6] p-4 text-sm text-[#798c8e] dark:bg-white/5">
                      {t("noSlots")}
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((slot) => (
                        <button
                          key={`${slot.startsAt}-${slot.staffId}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          aria-pressed={
                            selectedSlot?.startsAt === slot.startsAt
                          }
                          className={`min-h-12 rounded-xl border text-sm font-semibold transition ${selectedSlot?.startsAt === slot.startsAt ? "border-[var(--tempo-primary)] bg-[var(--tempo-primary)] text-[var(--tempo-on-primary)]" : "border-[#dce6e3] bg-white text-[#54757c] hover:border-[#6c9a99] dark:border-white/10 dark:bg-white/5 dark:text-white"}`}
                        >
                          {formatTime(slot.startsAt)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-7 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="min-h-14 flex-1 rounded-full border border-[#dce6e3] font-semibold text-[#668084] dark:border-white/10 dark:text-white"
                  >
                    {t("back")}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedSlot || loadingSlots}
                    onClick={() => setStep(2)}
                    className="min-h-14 flex-[1.6] rounded-full bg-[var(--tempo-primary)] font-semibold text-[var(--tempo-on-primary)] disabled:opacity-50"
                  >
                    {t("next")}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <form onSubmit={handleSubmit(confirmBooking)}>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t("yourDetails")}
                </h2>
                {selectedService && selectedSlot && (
                  <div className="mt-4 rounded-2xl bg-[#f4f8f6] p-4 text-sm dark:bg-white/5">
                    <p className="font-semibold">
                      {selectedService.name} · {money(selectedService.priceHuf)}
                    </p>
                    <p className="mt-1 text-[#788b8e]">
                      {formatDate(date)} · {formatTime(selectedSlot.startsAt)}
                    </p>
                  </div>
                )}
                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      {t("name")}
                    </span>
                    <input
                      autoComplete="name"
                      required
                      {...register("name")}
                      className={inputClass}
                    />
                    {errors.name && (
                      <span className="mt-1 block text-sm text-[#ad5f55]">
                        {q("required")}
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      {t("phone")}
                    </span>
                    <input
                      type="tel"
                      autoComplete="tel"
                      required
                      {...register("phone")}
                      className={inputClass}
                    />
                    {errors.phone && (
                      <span className="mt-1 block text-sm text-[#ad5f55]">
                        {q("required")}
                      </span>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">
                      {t("email")}
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      required
                      {...register("email")}
                      className={inputClass}
                    />
                    {errors.email && (
                      <span className="mt-1 block text-sm text-[#ad5f55]">
                        {q("required")}
                      </span>
                    )}
                  </label>
                </div>
                {showPaymentChoice && (
                  <fieldset className="mt-5">
                    <legend className="mb-2 text-sm font-semibold">
                      {t("paymentMethod")}
                    </legend>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("on_site")}
                        aria-pressed={paymentMethod === "on_site"}
                        className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${paymentMethod === "on_site" ? "border-[var(--tempo-primary)] bg-[#eff6f2] text-[var(--tempo-primary)] dark:bg-white/10" : "border-[#dce6e3] text-[#6d8386] dark:border-white/10 dark:text-[#bdcaca]"}`}
                      >
                        {t("payOnSite")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod("stripe")}
                        aria-pressed={paymentMethod === "stripe"}
                        className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${paymentMethod === "stripe" ? "border-[var(--tempo-primary)] bg-[#eff6f2] text-[var(--tempo-primary)] dark:bg-white/10" : "border-[#dce6e3] text-[#6d8386] dark:border-white/10 dark:text-[#bdcaca]"}`}
                      >
                        {t("onlinePay")}
                      </button>
                    </div>
                  </fieldset>
                )}
                {visibleError && (
                  <p
                    role="alert"
                    className="mt-4 text-sm font-medium text-[#ad5f55]"
                  >
                    {visibleError}
                  </p>
                )}
                <p className="mt-4 text-sm leading-6 text-[#829193]">
                  {t("privacy")}
                </p>
                <div className="mt-7 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="min-h-14 flex-1 rounded-full border border-[#dce6e3] font-semibold text-[#668084] dark:border-white/10 dark:text-white"
                  >
                    {t("back")}
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="min-h-14 flex-[1.8] rounded-full bg-[var(--tempo-primary)] font-semibold text-[var(--tempo-on-primary)] disabled:opacity-50"
                  >
                    {busy ? common("loading") : t("confirm")}
                  </button>
                </div>
              </form>
            )}
          </section>
        )}
        <footer className="mt-6 flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-[#829193]">{t("privacy")}</p>
          <PoweredBy />
        </footer>
      </div>
    </main>
  )
}
