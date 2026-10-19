import Link from "next/link"
import { useTranslations } from "next-intl"
import { BrandLockup } from "@/components/brand-lockup"

export default function OfflinePage() {
  const t = useTranslations("PWA")
  return <main className="marketing-shell flex min-h-svh flex-col items-center justify-center px-5 py-12 text-center"><BrandLockup /><span className="mt-12 flex size-16 items-center justify-center rounded-3xl bg-[#e5efeb] text-3xl text-[#5c8787] dark:bg-white/10 dark:text-[#c6d9d6]" aria-hidden="true">◷</span><h1 className="mt-6 text-3xl font-semibold text-[#263f49] dark:text-white">{t("offlineTitle")}</h1><p className="mt-3 max-w-md text-base leading-7 text-[#718487] dark:text-[#b4c2c4]">{t("offlineDescription")}</p><Link href="/app" className="mt-7 inline-flex min-h-14 items-center justify-center rounded-full bg-[#416e7e] px-7 font-semibold text-white">{t("offlineLink")}</Link></main>
}
