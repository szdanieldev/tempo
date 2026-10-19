"use client"
import { Button } from "@/components/ui/button"

import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale()
  const t = useTranslations("Common")
  const router = useRouter()

  function changeLocale(nextLocale: string) {
    void fetch("/api/locale", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: nextLocale }) })
      .then((response) => { if (response.ok) router.refresh() })
  }

  return (
    <div className="inline-flex items-center rounded-full border border-border/70 bg-background p-1" aria-label={t("languageHu")}>
      {(["hu", "en"] as const).map((option) => (
        <Button
          key={option}
          type="button"
          onClick={() => changeLocale(option)}
          aria-pressed={locale === option}
          className={`min-h-9 min-w-11 rounded-full px-3 text-sm font-medium transition ${locale === option ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}
        >
          {compact ? option.toUpperCase() : option === "hu" ? t("languageHu") : t("languageEn")}
        </Button>
      ))}
    </div>
  )
}
