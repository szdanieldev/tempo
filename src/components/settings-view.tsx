"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { suggestSlug } from "@/lib/slug"

export function SettingsView({ initialName, initialSlug, rootDomain, stripeConnectEnabled, initialOnlinePayment, subscriptionStatus, hasBillingCustomer, billingAvailable, defaultLocale, timezone, initialHours, initialBookingRules, isAdmin }: { initialName: string; initialSlug: string; rootDomain: string; stripeConnectEnabled: boolean; initialOnlinePayment: boolean; subscriptionStatus: string; hasBillingCustomer: boolean; billingAvailable: boolean; defaultLocale: "hu" | "en"; timezone: string; initialHours: { opensAt: string; closesAt: string }; initialBookingRules: { minimumNoticeMinutes: number; maxDaysAhead: number; bufferMinutes: number; cancellationWindowHours: number; autoConfirm: boolean; emailReminder: boolean }; isAdmin: boolean }) {
  const t = useTranslations("Settings")
  const common = useTranslations("Common")
  const [name, setName] = useState(initialName)
  const [slug, setSlug] = useState(initialSlug)
  const [opensAt, setOpensAt] = useState(initialHours.opensAt)
  const [closesAt, setClosesAt] = useState(initialHours.closesAt)
  const [buffer, setBuffer] = useState(String(initialBookingRules.bufferMinutes))
  const [minimumNotice, setMinimumNotice] = useState(String(initialBookingRules.minimumNoticeMinutes))
  const [daysAhead, setDaysAhead] = useState(String(initialBookingRules.maxDaysAhead))
  const [cancellationWindow, setCancellationWindow] = useState(String(initialBookingRules.cancellationWindowHours))
  const [onlinePayment, setOnlinePayment] = useState(initialOnlinePayment)
  const [locale, setLocale] = useState(defaultLocale)
  const [reminder, setReminder] = useState(initialBookingRules.emailReminder)
  const [autoConfirm, setAutoConfirm] = useState(initialBookingRules.autoConfirm)
  const [advanced, setAdvanced] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [paymentBusy, setPaymentBusy] = useState(false)

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = { name: name.trim(), slug, defaultLocale: locale, opensAt, closesAt, bufferMinutes: Number(buffer), minimumNoticeMinutes: Number(minimumNotice), maxDaysAhead: Number(daysAhead), cancellationWindowHours: Number(cancellationWindow), stripeOnline: onlinePayment, emailReminder: reminder, autoConfirm }
    setError("")
    try {
      const response = await fetch("/api/organization/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (!response.ok) throw new Error("save_failed")
    } catch {
      setError(t("saveFailed"))
      return
    }
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3000)
  }

  async function openStripe(url: string) {
    setPaymentBusy(true)
    setError("")
    try {
      const response = await fetch(url, { method: "POST" })
      const result = await response.json() as { url?: string }
      if (!response.ok || !result.url) throw new Error("stripe_failed")
      window.location.assign(result.url)
    } catch {
      setError(t("stripeFailed"))
    } finally {
      setPaymentBusy(false)
    }
  }

  return <section className="mx-auto max-w-4xl">
    <div className="mb-7"><h1 className="text-3xl font-semibold tracking-tight text-[#263f49] sm:text-4xl dark:text-white">{t("title")}</h1><p className="mt-2 text-base text-[#76898d] dark:text-[#b4c2c4]">{t("description")}</p></div>
    {!isAdmin ? <p className="rounded-3xl border border-[#e3ebe8] bg-white p-6 text-base dark:border-white/10 dark:bg-[#1b3037]">{t("adminOnly")}</p> : <form onSubmit={(event) => void saveSettings(event)} className="space-y-5">
      <section className="rounded-3xl border border-[#e3ebe8] bg-white p-5 shadow-[0_4px_20px_rgba(45,75,78,.035)] sm:p-7 dark:border-white/10 dark:bg-[#1b3037]"><h2 className="mb-5 text-lg font-semibold text-[#334e55] dark:text-white">{t("business")}</h2><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold text-[#496267] dark:text-[#d0dedd]">{t("businessName")}</span><input required value={name} onChange={(event) => { setName(event.target.value); if (!slug || slug === suggestSlug(initialName)) setSlug(suggestSlug(event.target.value)) }} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold text-[#496267] dark:text-[#d0dedd]">{t("publicAddress")}</span><div className="flex min-h-14 items-center overflow-hidden rounded-2xl border border-[#dce6e3] bg-white dark:border-white/10 dark:bg-[#20373e]"><input required pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" maxLength={40} value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} className="min-w-0 flex-1 bg-transparent px-4 text-base outline-none dark:text-white" /><span className="pr-4 text-sm text-[#829193]">{rootDomain ? `.${rootDomain}` : ""}</span></div></label><label className="mt-4 block"><span className="mb-2 block text-sm font-semibold text-[#496267] dark:text-[#d0dedd]">{t("language")}</span><select value={locale} onChange={(event) => setLocale(event.target.value === "en" ? "en" : "hu")} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"><option value="hu">{common("languageHu")}</option><option value="en">{common("languageEn")}</option></select></label></section>

      <section className="rounded-3xl border border-[#e3ebe8] bg-white p-5 shadow-[0_4px_20px_rgba(45,75,78,.035)] sm:p-7 dark:border-white/10 dark:bg-[#1b3037]"><h2 className="mb-5 text-lg font-semibold text-[#334e55] dark:text-white">{t("openingHours")}</h2><div className="mb-4 flex min-h-12 items-center justify-between rounded-2xl bg-[#f6f9f7] px-4 dark:bg-white/5"><span className="text-sm font-medium">{t("workingDays")}</span><span className="text-sm text-[#728688]">{t("weekdays")}</span></div><div className="grid grid-cols-2 gap-3"><label><span className="mb-2 block text-sm font-semibold">{t("startTime")}</span><input type="time" value={opensAt} onChange={(event) => setOpensAt(event.target.value)} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label><span className="mb-2 block text-sm font-semibold">{t("endTime")}</span><input type="time" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label></div><p className="mt-3 text-sm text-[#829193]">{t("timezone")}: {timezone}</p></section>

      <section className="rounded-3xl border border-[#e3ebe8] bg-white p-5 shadow-[0_4px_20px_rgba(45,75,78,.035)] sm:p-7 dark:border-white/10 dark:bg-[#1b3037]"><h2 className="mb-2 text-lg font-semibold text-[#334e55] dark:text-white">{t("payments")}</h2><Toggle label={t("payOnSite")} checked disabled /><div className="mt-2 rounded-2xl bg-[#f6f9f7] p-4 dark:bg-white/5"><p className="font-semibold text-[#496267] dark:text-[#d0dedd]">{t("stripeConnect")}</p><p className="mt-1 text-sm text-[#728688]">{stripeConnectEnabled ? t("stripeConnected") : t("stripeNotConnected")}</p>{!stripeConnectEnabled && <button type="button" disabled={paymentBusy} onClick={() => void openStripe("/api/stripe/connect")} className="mt-3 min-h-12 rounded-full bg-[#416e7e] px-5 text-sm font-semibold text-white disabled:opacity-50">{paymentBusy ? t("working") : t("connectStripe")}</button>}</div><Toggle label={t("onlinePayment")} checked={onlinePayment} disabled={!stripeConnectEnabled} onChange={setOnlinePayment} /><div className="mt-4 border-t border-[#edf1ef] pt-4 dark:border-white/10"><p className="font-semibold text-[#496267] dark:text-[#d0dedd]">{t("subscription")}</p><p className="mt-1 text-sm text-[#728688]">{t("subscriptionStatus", { status: subscriptionStatus })}</p>{billingAvailable && <button type="button" disabled={paymentBusy} onClick={() => void openStripe(hasBillingCustomer ? "/api/stripe/billing/portal" : "/api/stripe/billing")} className="mt-3 min-h-12 rounded-full border border-[#cbdad7] px-5 text-sm font-semibold text-[#416e7e] disabled:opacity-50 dark:border-white/15 dark:text-[#c4d9d6]">{paymentBusy ? t("working") : hasBillingCustomer ? t("manageSubscription") : t("startSubscription")}</button>}</div><h2 className="mb-2 mt-6 text-lg font-semibold text-[#334e55] dark:text-white">{t("notifications")}</h2><Toggle label={t("reminder")} checked={reminder} onChange={setReminder} /></section>

      <details open={advanced} onToggle={(event) => setAdvanced((event.target as HTMLDetailsElement).open)} className="rounded-3xl border border-[#e3ebe8] bg-white px-5 py-4 shadow-[0_4px_20px_rgba(45,75,78,.035)] sm:px-7 dark:border-white/10 dark:bg-[#1b3037]"><summary className="cursor-pointer list-none py-2 text-lg font-semibold text-[#334e55] dark:text-white">{t("advanced")} <span className="float-right text-sm font-medium text-[#819294]">⌄</span></summary><div className="grid gap-4 pb-3 pt-4 sm:grid-cols-2"><label><span className="mb-2 block text-sm font-semibold">{t("minimumNotice")}</span><input type="number" min={0} max={43200} value={minimumNotice} onChange={(event) => setMinimumNotice(event.target.value)} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label><span className="mb-2 block text-sm font-semibold">{t("daysAhead")}</span><input type="number" min={1} max={365} value={daysAhead} onChange={(event) => setDaysAhead(event.target.value)} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label><span className="mb-2 block text-sm font-semibold">{t("buffer")}</span><input type="number" min={0} max={240} value={buffer} onChange={(event) => setBuffer(event.target.value)} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label><span className="mb-2 block text-sm font-semibold">{t("cancellationWindow")}</span><input type="number" min={0} max={720} value={cancellationWindow} onChange={(event) => setCancellationWindow(event.target.value)} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><div className="sm:col-span-2"><Toggle label={t("automaticConfirmation")} checked={autoConfirm} onChange={setAutoConfirm} /></div></div></details>

      {error && <p role="alert" className="rounded-2xl bg-[#f8efed] p-4 text-sm font-medium text-[#a65b52]">{error}</p>}
      <div className="sticky bottom-24 z-10 flex justify-end py-2 lg:bottom-5"><button type="submit" className="min-h-14 w-full rounded-full bg-[#416e7e] px-8 text-base font-semibold text-white shadow-lg sm:w-auto">{t("save")}</button></div>
    </form>
    }
    {saved && <p role="status" className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#294d55] px-5 py-3 text-sm font-medium text-white shadow-lg lg:bottom-8">{t("saved")}</p>}
  </section>
}

function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange?: (value: boolean) => void; disabled?: boolean }) {
  return <label className={`flex min-h-14 items-center justify-between gap-4 border-b border-[#edf1ef] py-2 last:border-b-0 dark:border-white/10 ${disabled ? "opacity-65" : "cursor-pointer"}`}><span className="text-sm font-medium text-[#496267] dark:text-[#d0dedd]">{label}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} className="size-5 accent-[#416e7e]" /></label>
}
