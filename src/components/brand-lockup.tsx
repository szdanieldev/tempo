import { brand } from "@/config/brand"
import { useTranslations } from "next-intl"

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("Brand")
  return (
    <span className="inline-flex items-center gap-2" aria-label={`${brand.name} ${t("byline")}`}>
      <span className="tempo-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-semibold tracking-tight">{brand.name}</span>
        {!compact && <span className="mt-1 text-[10px] font-medium text-muted-foreground">{t("byline")}</span>}
      </span>
    </span>
  )
}

export function PoweredBy() {
  const t = useTranslations("Brand")
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span>{t("poweredBy")}</span>
      <span className="tempo-mark tempo-mark-small" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="font-medium text-foreground">{brand.name}</span>
      <span>{t("byline")}</span>
    </span>
  )
}
