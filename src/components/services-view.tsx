"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { brand } from "@/config/brand"
import type { ServiceSummary } from "@/lib/domain/types"

export function ServicesView({ initialServices, isAdmin }: { initialServices: ServiceSummary[]; demo: boolean; isAdmin: boolean }) {
  const t = useTranslations("Services")
  const common = useTranslations("Common")
  const locale = useLocale()
  const [services, setServices] = useState(initialServices)
  const [draft, setDraft] = useState<ServiceSummary | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")

  async function saveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft) return
    const next = { ...draft, name: draft.name.trim() }
    setError("")
    try {
      const response = await fetch("/api/services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) })
      if (!response.ok) throw new Error("save_failed")
    } catch {
      setError(t("saveFailed"))
      return
    }
    setServices((current) => current.some((item) => item.id === next.id) ? current.map((item) => item.id === next.id ? next : item) : [...current, next])
    setDraft(null)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 3000)
  }

  async function toggleService(service: ServiceSummary) {
    const next = { ...service, isActive: !service.isActive }
    setError("")
    try {
      const response = await fetch("/api/services", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: service.id, isActive: next.isActive }) })
      if (!response.ok) throw new Error("update_failed")
      setServices((current) => current.map((item) => item.id === service.id ? next : item))
    } catch { setError(t("saveFailed")) }
  }

  const currency = new Intl.NumberFormat(locale === "hu" ? "hu-HU" : "en-GB", { style: "currency", currency: "HUF", maximumFractionDigits: 0 })

  return <section className="mx-auto max-w-5xl">
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-[#718487]">{brand.name}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#263f49] sm:text-4xl dark:text-white">{t("title")}</h1><p className="mt-2 text-base text-[#76898d] dark:text-[#b4c2c4]">{t("description")}</p></div>{isAdmin && <button type="button" onClick={() => setDraft({ id: crypto.randomUUID(), name: "", durationMinutes: 60, priceHuf: 0, depositHuf: null, isActive: true, isDefault: false })} className="min-h-12 rounded-full bg-[#416e7e] px-5 text-sm font-semibold text-white shadow-sm">+ {t("add")}</button>}</div>
    {error && <p role="alert" className="mb-4 rounded-2xl bg-[#f8efed] p-4 text-sm font-medium text-[#a65b52]">{error}</p>}
    <div className="space-y-3">{services.map((service) => <article key={service.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#e3ebe8] bg-white p-5 shadow-[0_4px_20px_rgba(45,75,78,.035)] sm:px-6 dark:border-white/10 dark:bg-[#1b3037]"><div className="flex min-w-0 items-center gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-[#edf4f0] text-lg text-[#5d8582] dark:bg-white/10 dark:text-[#c0d7d4]" aria-hidden="true">✳</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-semibold text-[#314d54] dark:text-white">{service.name}</h2>{service.isDefault && <span className="rounded-full bg-[#f1f5f2] px-2.5 py-1 text-xs font-medium text-[#718581] dark:bg-white/10 dark:text-[#c2d2ce]">{t("default")}</span>}</div><p className="mt-1 text-sm text-[#7a8d8f]">{service.durationMinutes} {t("minutes")} · {currency.format(service.priceHuf)}{service.depositHuf ? ` · ${t("deposit")}: ${currency.format(service.depositHuf)}` : ""}</p></div></div><div className="flex items-center gap-3">{isAdmin && <><button type="button" onClick={() => setDraft(service)} className="min-h-11 rounded-full border border-[#dfe8e5] px-4 text-sm font-semibold text-[#607c80] dark:border-white/10 dark:text-white">{t("save")}</button><button type="button" onClick={() => void toggleService(service)} aria-pressed={service.isActive} className={`min-h-11 min-w-20 rounded-full px-4 text-sm font-semibold ${service.isActive ? "bg-[#eaf3ed] text-[#4d7d6a] dark:bg-white/10 dark:text-[#c6dfd0]" : "bg-[#f2f4f3] text-[#879394] dark:bg-white/5 dark:text-[#a4b0b1]"}`}>{service.isActive ? t("active") : t("inactive")}</button></>}</div></article>)}
      {services.length === 0 && <div className="rounded-3xl border border-dashed border-[#cfdeda] bg-white/70 p-12 text-center text-[#7b8d8f] dark:border-white/15 dark:bg-white/5">{t("empty")}</div>}
    </div>
    {saved && <p role="status" className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#294d55] px-5 py-3 text-sm font-medium text-white shadow-lg">{t("saved")}</p>}
    {draft && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#172a31]/45 p-0 sm:items-center sm:p-5"><form onSubmit={(event) => void saveService(event)} role="dialog" aria-modal="true" aria-labelledby="service-dialog-title" className="w-full max-w-lg rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem] dark:bg-[#1b3037]"><h2 id="service-dialog-title" className="mb-5 text-2xl font-semibold text-[#304a52] dark:text-white">{draft.name ? t("title") : t("add")}</h2><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">{t("name")}</span><input required autoFocus value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">{t("duration")}</span><input required type="number" min={5} max={720} step={5} value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">{t("price")}</span><input required type="number" min={0} step={500} value={draft.priceHuf} onChange={(event) => setDraft({ ...draft, priceHuf: Number(event.target.value) })} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label className="mb-4 block"><span className="mb-2 block text-sm font-semibold">{t("deposit")}</span><input type="number" min={0} max={draft.priceHuf} step={500} value={draft.depositHuf ?? ""} onChange={(event) => setDraft({ ...draft, depositHuf: event.target.value ? Number(event.target.value) : null })} className="min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white" /></label><label className="mb-5 flex min-h-12 items-center gap-3"><input type="checkbox" checked={draft.isDefault} onChange={(event) => setDraft({ ...draft, isDefault: event.target.checked })} className="size-5 accent-[#416e7e]" /><span className="text-sm">{t("default")}</span></label><div className="flex gap-3"><button type="button" onClick={() => setDraft(null)} className="min-h-14 flex-1 rounded-full border border-[#dce6e3] font-semibold text-[#668084] dark:border-white/10 dark:text-white">{common("cancel")}</button><button type="submit" className="min-h-14 flex-1 rounded-full bg-[#416e7e] font-semibold text-white">{t("save")}</button></div></form></div>}
  </section>
}
