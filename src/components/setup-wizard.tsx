"use client"

import { useState } from "react"
import Link from "next/link"
import { useOrganizationList } from "@clerk/nextjs"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { suggestSlug, validateSlug } from "@/lib/slug"
import { setupSchema } from "@/lib/validation"
import type { z } from "zod"

type SetupData = z.infer<typeof setupSchema>

export function ClerkSetupWizard({ rootDomain }: { rootDomain: string }) {
  const { setActive, isLoaded } = useOrganizationList()
  const router = useRouter()

  async function finishSetup(data: SetupData) {
    const response = await fetch("/api/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    const result = await response.json().catch(() => ({})) as { ok?: boolean; organizationId?: string; error?: string }
    if (!response.ok || !result.organizationId) throw new Error(result.error ?? "setup_save_failed")
    if (!setActive) throw new Error("organization_session_unavailable")
    await setActive({ organization: result.organizationId })
    router.replace("/app")
    router.refresh()
  }

  async function checkSlug(slug: string) {
    const response = await fetch(`/api/setup/slug?slug=${encodeURIComponent(slug)}`)
    const result = await response.json().catch(() => ({})) as { available?: boolean; error?: string }
    if (!response.ok) throw new Error(result.error ?? "setup_save_failed")
    return result
  }

  return <SetupForm finishSetup={finishSetup} checkSlug={checkSlug} rootDomain={rootDomain} ready={isLoaded} />
}

export function DemoSetupWizard({ rootDomain }: { rootDomain: string }) {
  const router = useRouter()
  async function finishSetup(data: SetupData) {
    window.localStorage.setItem("tempo-demo-setup", JSON.stringify(data))
    router.replace("/app")
  }
  return <SetupForm finishSetup={finishSetup} rootDomain={rootDomain} ready />
}

function SetupForm({ finishSetup, checkSlug, rootDomain, ready }: { finishSetup: (data: SetupData) => Promise<void>; checkSlug?: (slug: string) => Promise<{ available?: boolean; error?: string }>; rootDomain: string; ready: boolean }) {
  const t = useTranslations("Auth")
  const q = useTranslations("QuickAdd")
  const common = useTranslations("Common")
  const [step, setStep] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState("")
  const { register, handleSubmit, trigger, getValues, setValue, setError: setFormError, clearErrors, formState: { errors } } = useForm<SetupData>({
    resolver: zodResolver(setupSchema),
    defaultValues: { name: "", slug: "", opensAt: "09:00", closesAt: "17:00", serviceName: "", durationMinutes: 60, priceHuf: 0 },
  })

  async function nextStep() {
    setError("")
    if (step === 0) {
      if (!(await trigger(["name", "slug"]))) return
      const slug = getValues("slug")
      const validation = validateSlug(slug)
      if (!validation.valid) {
        setFormError("slug", { type: "validate", message: t(validation.reason === "reserved" ? "slugReserved" : "slugInvalid") })
        return
      }
      if (checkSlug) {
        setChecking(true)
        try {
          const result = await checkSlug(slug)
          if (!result.available) {
            setFormError("slug", { type: "validate", message: t(result.error === "invalid_slug" ? "slugInvalid" : "slugInUse") })
            return
          }
        } catch {
          setError(t("setupFailed"))
          return
        } finally { setChecking(false) }
      }
      setStep(1)
    } else if (step === 1 && await trigger(["opensAt", "closesAt"])) setStep(2)
  }

  async function submit(data: SetupData) {
    const validation = validateSlug(data.slug)
    if (!validation.valid) {
      setFormError("slug", { type: "validate", message: t(validation.reason === "reserved" ? "slugReserved" : "slugInvalid") })
      setStep(0)
      return
    }
    setSubmitting(true)
    setError("")
    try {
      await finishSetup(data)
    } catch (cause) {
      const code = cause instanceof Error ? cause.message : "setup_save_failed"
      if (code === "slug_in_use" || code === "invalid_slug") {
        setFormError("slug", { type: "validate", message: t(code === "slug_in_use" ? "slugInUse" : "slugInvalid") })
        setStep(0)
      } else setError(t("setupFailed"))
    } finally { setSubmitting(false) }
  }

  const stepTitles = [t("setupStepBusiness"), t("setupStepHours"), t("setupStepService")]
  const fieldClass = "h-12 rounded-md"

  return <main className="flex min-h-svh flex-col bg-background text-foreground">
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
      <Link href="/" aria-label={t("backHome")}><BrandLockup /></Link>
      <LanguageSwitcher compact />
    </header>
    <div className="flex flex-1 items-center justify-center px-4 py-8">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardDescription>{t("setupDescription")}</CardDescription>
          <CardTitle className="text-2xl">{t("setupTitle")}</CardTitle>
          <div className="pt-3">
            <Progress value={((step + 1) / 3) * 100} aria-label={`${t("step")} ${step + 1} ${t("of")} 3`} />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">{stepTitles.map((title, index) => <span key={title} className={index === step ? "font-medium text-foreground" : ""}>{title}</span>)}</div>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit(submit)}>
          <CardContent className="space-y-5">
            {step === 0 && <>
              <div className="space-y-2"><Label htmlFor="business-name">{t("businessName")}</Label><Input id="business-name" autoFocus className={fieldClass} aria-invalid={Boolean(errors.name)} {...register("name", { onChange: (event) => { setValue("slug", suggestSlug(event.target.value)); clearErrors("slug") } })} />{errors.name && <p role="alert" className="text-sm text-destructive">{t("setupFailed")}</p>}</div>
              <div className="space-y-2"><Label htmlFor="booking-slug">{t("slug")}</Label><div className="flex items-center gap-2"><Input id="booking-slug" className={fieldClass} aria-invalid={Boolean(errors.slug)} autoCapitalize="none" autoCorrect="off" spellCheck={false} {...register("slug", { onChange: () => clearErrors("slug") })} /><span className="shrink-0 text-sm text-muted-foreground">.{rootDomain}</span></div>{errors.slug && <p role="alert" className="text-sm text-destructive">{errors.slug.message}</p>}</div>
            </>}
            {step === 1 && <><h2 className="text-base font-medium">{t("workingDays")}</h2><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="opens-at">{t("startTime")}</Label><Input id="opens-at" type="time" className={fieldClass} {...register("opensAt")} /></div><div className="space-y-2"><Label htmlFor="closes-at">{t("endTime")}</Label><Input id="closes-at" type="time" className={fieldClass} {...register("closesAt")} /></div></div><p className="text-sm text-muted-foreground">{t("timezone")}: Europe/Budapest</p></>}
            {step === 2 && <><div className="space-y-2"><Label htmlFor="service-name">{t("setupStepService")}</Label><Input id="service-name" autoFocus className={fieldClass} placeholder={t("serviceName")} {...register("serviceName")} /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="service-duration">{t("duration")}</Label><Input id="service-duration" type="number" min={5} max={720} step={5} className={fieldClass} {...register("durationMinutes", { valueAsNumber: true })} /></div><div className="space-y-2"><Label htmlFor="service-price">{t("price")}</Label><Input id="service-price" type="number" min={0} step={500} className={fieldClass} {...register("priceHuf", { valueAsNumber: true })} /></div></div></>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter className="justify-end gap-3 border-t">
            {step > 0 && <Button type="button" variant="outline" className="min-h-11" onClick={() => setStep((current) => current - 1)}>{q("cancel")}</Button>}
            {step < 2 ? <Button type="button" className="min-h-11" onClick={() => void nextStep()} disabled={!ready || checking}>{checking ? t("slugChecking") : t("continue")}</Button> : <Button type="submit" className="min-h-11" disabled={submitting || !ready}>{submitting ? common("loading") : t("finishSetup")}</Button>}
          </CardFooter>
        </form>
      </Card>
    </div>
  </main>
}
