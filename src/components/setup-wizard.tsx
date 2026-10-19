"use client"
import { Button } from "@/components/ui/button"

import { useState } from "react"
import Link from "next/link"
import { useOrganizationList } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"
import { validateSlug, suggestSlug } from "@/lib/slug"
import { setupSchema } from "@/lib/validation"
import type { z } from "zod"

type SetupData = z.infer<typeof setupSchema>

export function ClerkSetupWizard() {
  const { createOrganization, setActive, isLoaded } = useOrganizationList()
  const router = useRouter()

  async function finishSetup(data: SetupData) {
    const organization = await createOrganization?.({ name: data.name, slug: data.slug })
    if (!organization) throw new Error("Organization creation failed")
    await setActive?.({ organization: organization.id })
    const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    if (!response.ok) throw new Error("Setup failed")
    router.replace("/app")
    router.refresh()
  }

  return <SetupForm finishSetup={finishSetup} ready={isLoaded} />
}

export function DemoSetupWizard() {
  const router = useRouter()
  async function finishSetup(data: SetupData) {
    window.localStorage.setItem("tempo-demo-setup", JSON.stringify(data))
    router.replace("/app")
  }
  return <SetupForm finishSetup={finishSetup} ready />
}

function SetupForm({ finishSetup, ready }: { finishSetup: (data: SetupData) => Promise<void>; ready: boolean }) {
  const t = useTranslations("Auth")
  const q = useTranslations("QuickAdd")
  const common = useTranslations("Common")
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const { register, handleSubmit, trigger, getValues, setValue, setError: setFormError, formState: { errors } } = useForm<SetupData>({
    resolver: zodResolver(setupSchema),
    defaultValues: { name: "", slug: "", opensAt: "09:00", closesAt: "17:00", serviceName: "", durationMinutes: 60, priceHuf: 0 },
  })
  async function nextStep() {
    setError("")
    if (step === 0) {
      const slug = getValues("slug")
      const validation = validateSlug(slug)
      if (!validation.valid) {
        setFormError("slug", { type: "validate", message: t("setupError") })
        return
      }
      if (await trigger(["name", "slug"])) setStep(1)
    } else if (step === 1 && await trigger(["opensAt", "closesAt"])) {
      setStep(2)
    }
  }

  async function submit(data: SetupData) {
    const validation = validateSlug(data.slug)
    if (!validation.valid) {
      setFormError("slug", { type: "validate", message: t("setupError") })
      setStep(0)
      return
    }
    setSubmitting(true)
    setError("")
    try { await finishSetup(data) } catch { setError(t("setupError")) } finally { setSubmitting(false) }
  }

  const stepTitles = [t("setupStepBusiness"), t("setupStepHours"), t("setupStepService")]
  const inputClass = "min-h-14 w-full rounded-2xl border border-[#dce6e3] bg-white px-4 text-base outline-none focus:border-[#6492a0] focus:ring-3 focus:ring-[#6492a0]/15 dark:border-white/10 dark:bg-[#20373e] dark:text-white"

  return <main className="marketing-shell flex min-h-svh flex-col"><header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Link href="/"><BrandLockup /></Link><LanguageSwitcher compact /></header><div className="flex flex-1 items-center justify-center px-5 py-8"><form onSubmit={handleSubmit(submit)} className="w-full max-w-xl rounded-[2rem] border border-white/80 bg-white/90 p-6 shadow-[0_28px_90px_rgba(48,79,86,.14)] sm:p-9 dark:border-white/10 dark:bg-[#1d3037]">
    <div className="mb-7"><p className="text-sm font-medium text-[#62848a]">{t("setupDescription")}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#263f49] dark:text-white">{t("setupTitle")}</h1></div>
    <div className="mb-8 grid grid-cols-3 gap-2" aria-label={`${t("step")} ${step + 1} ${t("of")} 3`}>{stepTitles.map((title, index) => <div key={title} className="space-y-2"><span className={`block h-1.5 rounded-full ${index <= step ? "bg-[#5f8d8d]" : "bg-[#e4ece8] dark:bg-white/10"}`} /><span className={`block text-xs font-medium ${index === step ? "text-[#4d747b] dark:text-[#d2e2e0]" : "text-[#8b9999]"}`}>{title}</span></div>)}</div>
    {step === 0 && <div className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">{t("businessName")}</span><input autoFocus {...register("name", { onChange: (event) => { setValue("slug", suggestSlug(event.target.value), { shouldValidate: false }) } })} className={inputClass} />{errors.name && <span className="mt-1 block text-sm text-[#ad5f55]">{t("setupError")}</span>}</label><label className="block"><span className="mb-2 block text-sm font-semibold">{t("slug")}</span><div className="flex min-h-14 items-center overflow-hidden rounded-2xl border border-[#dce6e3] bg-white dark:border-white/10 dark:bg-[#20373e]"><input {...register("slug")} className="min-w-0 flex-1 bg-transparent px-4 text-base outline-none dark:text-white" /><span className="pr-4 text-sm text-[#829193]">.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? ""}</span></div>{errors.slug && <span className="mt-1 block text-sm text-[#ad5f55]">{errors.slug.message || t("setupError")}</span>}</label></div>}
    {step === 1 && <div><h2 className="mb-4 text-lg font-semibold text-[#304a52] dark:text-white">{t("workingDays")}</h2><div className="grid grid-cols-2 gap-3"><label><span className="mb-2 block text-sm font-semibold">{t("startTime")}</span><input type="time" {...register("opensAt")} className={inputClass} /></label><label><span className="mb-2 block text-sm font-semibold">{t("endTime")}</span><input type="time" {...register("closesAt")} className={inputClass} /></label></div><p className="mt-4 text-sm text-[#819294]">{t("timezone")}: Europe/Budapest</p></div>}
    {step === 2 && <div className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-semibold">{t("setupStepService")}</span><input required autoFocus {...register("serviceName")} placeholder={t("serviceName")} className={inputClass} /></label><div className="grid grid-cols-2 gap-3"><label><span className="mb-2 block text-sm font-semibold">{t("duration")}</span><input type="number" min={5} max={720} step={5} {...register("durationMinutes", { valueAsNumber: true })} className={inputClass} /></label><label><span className="mb-2 block text-sm font-semibold">{t("price")}</span><input type="number" min={0} step={500} {...register("priceHuf", { valueAsNumber: true })} className={inputClass} /></label></div></div>}
    {error && <p role="alert" className="mt-4 text-sm font-medium text-[#ad5f55]">{error}</p>}
    <div className="mt-8 flex gap-3">{step > 0 && <Button type="button" onClick={() => setStep((current) => current - 1)} className="min-h-14 flex-1 rounded-full border border-[#dce6e3] font-semibold text-[#668084] dark:border-white/10 dark:text-white">{q("cancel")}</Button>}{step < 2 ? <Button type="button" onClick={() => void nextStep()} disabled={!ready} className="min-h-14 flex-[1.5] rounded-full bg-[#416e7e] font-semibold text-white disabled:opacity-60">{t("continue")}</Button> : <Button type="submit" disabled={submitting || !ready} className="min-h-14 flex-[1.5] rounded-full bg-[#416e7e] font-semibold text-white disabled:opacity-60">{submitting ? common("loading") : t("finishSetup")}</Button>}</div>
  </form></div></main>
}
