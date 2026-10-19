"use client"
import { Button } from "@/components/ui/button"

import { useMemo, useState } from "react"
import { useLocale, useTranslations } from "next-intl"

type Customer = { id: string; name: string; phone: string | null; email: string | null; lastVisit: string; visits: number }
type CustomerAppointment = { id: string; starts_at: string; ends_at: string; status: "pending" | "confirmed" | "completed" | "cancelled"; price_huf: number; notes: string | null; service: { name: string } | { name: string }[] | null }

export function CustomersView({ customers: initialCustomers, timezone, isAdmin }: { customers: Customer[]; timezone: string; isAdmin: boolean }) {
  const t = useTranslations("Customers")
  const common = useTranslations("Common")
  const locale = useLocale()
  const [customers, setCustomers] = useState(initialCustomers)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Customer | null>(null)
  const [history, setHistory] = useState<CustomerAppointment[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [detailError, setDetailError] = useState(false)
  const [notice, setNotice] = useState("")
  const filtered = useMemo(() => customers.filter((customer) => `${customer.name} ${customer.phone ?? ""} ${customer.email ?? ""}`.toLocaleLowerCase(locale === "hu" ? "hu-HU" : "en-GB").includes(query.toLocaleLowerCase(locale === "hu" ? "hu-HU" : "en-GB"))), [customers, locale, query])

  async function openCustomer(customer: Customer) {
    setSelected(customer)
    setHistory([])
    setHistoryLoading(true)
    setDetailError(false)
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { cache: "no-store" })
      if (!response.ok) throw new Error("customer_not_found")
      const result = await response.json() as { appointments?: CustomerAppointment[] }
      setHistory(result.appointments ?? [])
    } catch { setDetailError(true) } finally { setHistoryLoading(false) }
  }

  async function removeCustomer(customer: Customer) {
    if (!window.confirm(t("deleteConfirm"))) return
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { method: "DELETE" })
      if (!response.ok) throw new Error("delete_failed")
    } catch { setNotice(t("deleteFailed")); return }
    setCustomers((current) => current.filter((item) => item.id !== customer.id))
    setSelected(null)
    setNotice(t("deleted"))
  }

  async function exportCustomer(customer: Customer) {
    try {
      const response = await fetch(`/api/customers/${customer.id}`, { cache: "no-store" })
      if (!response.ok) throw new Error("export_failed")
      const details: unknown = await response.json()
      const file = new Blob([JSON.stringify(details, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(file)
      const link = document.createElement("a")
      link.href = url
      link.download = `tempo-customer-${customer.id}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch { setNotice(t("exportFailed")) }
  }

  const formatDate = (date: string) => new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { timeZone: timezone, year: "numeric", month: "short", day: "numeric" }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00.000Z` : date))
  const formatDateTime = (date: string) => new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", { timeZone: timezone, dateStyle: "medium", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(date))

  return <section className="mx-auto max-w-5xl">
    <div className="mb-7"><h1 className="text-3xl font-semibold tracking-tight text-[#263f49] sm:text-4xl dark:text-white">{t("title")}</h1><p className="mt-2 text-base text-[#76898d] dark:text-[#b4c2c4]">{t("description")}</p></div>
    <label className="mb-5 block"><span className="sr-only">{t("search")}</span><span className="relative block"><span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#809194]" aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("search")} className="min-h-14 w-full rounded-2xl border border-[#dfe8e5] bg-white pl-12 pr-4 text-base shadow-[0_4px_20px_rgba(45,75,78,.035)] outline-none focus:border-[#78a1a7] focus:ring-3 focus:ring-[#78a1a7]/15 dark:border-white/10 dark:bg-[#1b3037] dark:text-white" /></span></label>
    <div className="overflow-hidden rounded-3xl border border-[#e3ebe8] bg-white shadow-[0_4px_20px_rgba(45,75,78,.035)] dark:border-white/10 dark:bg-[#1b3037]">
      {filtered.map((customer) => <Button key={customer.id} type="button" onClick={() => void openCustomer(customer)} className="grid min-h-[84px] w-full grid-cols-[1fr_auto] items-center gap-3 border-b border-[#edf1ef] px-5 py-4 text-left last:border-b-0 hover:bg-[#f8faf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:grid-cols-[1.3fr_1fr_1fr_auto] sm:px-6 dark:border-white/10 dark:hover:bg-white/5"><span className="flex min-w-0 items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf4f0] text-sm font-semibold text-[#5a827e] dark:bg-white/10 dark:text-[#c2d7d4]">{customer.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span className="min-w-0"><span className="block truncate font-semibold text-[#334e55] dark:text-white">{customer.name}</span><span className="mt-1 block truncate text-sm text-[#7d8e90] sm:hidden">{customer.phone || customer.email}</span></span></span><span className="hidden truncate text-sm text-[#708487] sm:block">{customer.phone || "—"}</span><span className="hidden truncate text-sm text-[#708487] sm:block">{customer.email || "—"}</span><span className="text-right"><span className="block text-sm font-medium text-[#58757b] dark:text-[#c2d3d3]">{formatDate(customer.lastVisit)}</span><span className="mt-1 block text-xs text-[#879697]">{customer.visits} {t("visits").toLocaleLowerCase(locale === "hu" ? "hu-HU" : "en-GB")}</span></span></Button>)}
      {filtered.length === 0 && <div className="p-12 text-center text-[#7b8d8f]">{t("empty")}</div>}
    </div>
    <p className="mt-4 text-sm text-[#7e8f91]">{t("privacy")}</p>
    {notice && <p role="status" className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2 rounded-full bg-[#294d55] px-5 py-3 text-sm font-medium text-white shadow-lg">{notice}</p>}
    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#172a31]/45 p-0 sm:items-center sm:p-5" onClick={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section role="dialog" aria-modal="true" aria-labelledby="customer-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[2rem] bg-white p-6 shadow-2xl sm:rounded-[2rem] dark:bg-[#1b3037]"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#789092]">{t("history")}</p><h2 id="customer-title" className="mt-2 text-2xl font-semibold text-[#304a52] dark:text-white">{selected.name}</h2></div><Button type="button" onClick={() => setSelected(null)} className="flex size-11 items-center justify-center rounded-full bg-[#f1f5f3] text-xl dark:bg-white/5" aria-label={common("close")}>×</Button></div><div className="mt-5 space-y-3 text-sm text-[#6b8184] dark:text-[#c0cccc]"><p>{selected.phone || "—"}</p><p>{selected.email || "—"}</p><p>{selected.visits} {t("visits").toLocaleLowerCase(locale === "hu" ? "hu-HU" : "en-GB")} · {formatDate(selected.lastVisit)}</p></div><h3 className="mb-2 mt-6 text-sm font-semibold text-[#415c62] dark:text-white">{t("history")}</h3>{historyLoading ? <p className="text-sm text-[#829193]">{common("loading")}</p> : detailError ? <p role="alert" className="text-sm text-[#a65b52]">{t("historyFailed")}</p> : history.length ? <ul className="max-h-56 space-y-2 overflow-y-auto">{history.map((appointment) => { const service = Array.isArray(appointment.service) ? appointment.service[0] : appointment.service; return <li key={appointment.id} className="rounded-2xl bg-[#f5f8f6] p-3 text-sm dark:bg-white/5"><p className="font-semibold">{formatDateTime(appointment.starts_at)} · {service?.name ?? common("noService")}</p><p className="mt-1 text-[#788b8e]">{t(appointment.status)} · {new Intl.NumberFormat(locale === "hu" ? "hu-HU" : "en-GB", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(appointment.price_huf)}</p>{appointment.notes && <p className="mt-1">{appointment.notes}</p>}</li> })}</ul> : <p className="text-sm text-[#829193]">{t("noHistory")}</p>}<div className="mt-6 space-y-3"><Button type="button" onClick={() => void exportCustomer(selected)} className="min-h-12 w-full rounded-full border border-[#dce6e3] font-semibold text-[#607b80] dark:border-white/10 dark:text-white">{t("export")}</Button>{isAdmin && <Button type="button" onClick={() => void removeCustomer(selected)} className="min-h-12 w-full rounded-full border border-[#efd9d4] font-semibold text-[#a65b52] dark:border-white/10 dark:text-[#efb0a5]">{t("delete")}</Button>}</div></section></div>}
  </section>
}
