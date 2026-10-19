import Link from "next/link"
import { useTranslations } from "next-intl"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"
import { brand } from "@/config/brand"

export default function Page() {
  const t = useTranslations("Marketing")
  const common = useTranslations("Common")
  const previewAppointments = [
    { time: t("previewTimeOne"), name: t("previewNameOne"), color: "#8daea3" },
    { time: t("previewTimeTwo"), name: t("previewNameTwo"), color: "#b798b2" },
    { time: t("previewTimeThree"), name: t("previewNameThree"), color: "#d1a17c" },
  ]

  return (
    <main className="marketing-shell min-h-svh overflow-hidden">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <Link href="/" aria-label={brand.name} className="text-lg"><BrandLockup /></Link>
        <div className="flex items-center gap-3">
          <LanguageSwitcher compact />
          <Link href="/sign-in" className="hidden min-h-11 items-center px-4 text-sm font-semibold text-foreground/80 hover:text-foreground sm:inline-flex">{t("signIn")}</Link>
          <Link href="/sign-up" className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">{t("start")}</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[.93fr_1.07fr] lg:gap-10 lg:px-12 lg:pb-28 lg:pt-20">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#dce7e8] bg-white/70 px-4 py-2 text-sm font-medium text-[#466b78] shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-[#b8ced1]"><span className="size-2 rounded-full bg-[#78a99f]" />{t("eyebrow")}</div>
          <h1 className="whitespace-pre-line text-5xl font-semibold leading-[1.06] tracking-[-.055em] text-[#1f3641] sm:text-6xl lg:text-[4.4rem] dark:text-white">{t("title")}</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[#5c7077] dark:text-[#bdcdd0]">{t("description")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/sign-up" className="inline-flex min-h-14 items-center justify-center gap-3 rounded-full bg-[#416e7e] px-7 text-base font-semibold text-white shadow-[0_10px_24px_rgba(58,99,113,.22)] transition hover:-translate-y-0.5 hover:bg-[#355f6d] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#91b4bb]/50">{t("start")}<span aria-hidden="true" className="text-lg">↗</span></Link>
            <span className="text-sm text-[#74868b] dark:text-[#a7b8bd]">{t("footer")}</span>
          </div>
          <div className="mt-12 flex items-center gap-3 border-t border-[#dbe4e4] pt-5 text-sm dark:border-white/10">
            <span className="flex -space-x-2" aria-hidden="true"><span className="size-8 rounded-full border-2 border-[#f3f7f5] bg-[#d8a991] dark:border-[#14252c]" /><span className="size-8 rounded-full border-2 border-[#f3f7f5] bg-[#879d82] dark:border-[#14252c]" /><span className="size-8 rounded-full border-2 border-[#f3f7f5] bg-[#b99bb8] dark:border-[#14252c]" /></span>
            <span className="text-[#60757b] dark:text-[#b2c2c6]">{t("featureSimple")}</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[600px] lg:ml-auto">
          <div className="hero-orbit absolute -right-16 -top-16 size-64 rounded-full border border-[#b9d0ce]/55" />
          <div className="hero-orbit absolute -bottom-24 -left-8 size-44 rounded-full border border-[#d1c3d3]/70" />
          <div className="agenda-preview relative rotate-[1deg] rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-[0_28px_90px_rgba(48,79,86,.16)] backdrop-blur-xl sm:p-7 dark:border-white/10 dark:bg-[#1d3037]/90">
            <div className="flex items-center justify-between border-b border-[#edf1ef] pb-5 dark:border-white/10"><div><div className="text-xs font-medium uppercase tracking-[.14em] text-[#809194]">{t("preview")}</div><div className="mt-2 text-2xl font-semibold tracking-tight text-[#263f49] dark:text-white">{t("today")}</div></div><div className="flex size-12 items-center justify-center rounded-2xl bg-[#edf4f1] text-xl text-[#527889] dark:bg-white/10 dark:text-[#b8d1d1]" aria-hidden="true">◷</div></div>
            <div className="my-5 flex items-center justify-between rounded-2xl bg-[#f4f8f6] px-4 py-3 dark:bg-white/5"><div><div className="text-xs text-[#7a8c8d]">{t("today")}</div><div className="mt-1 text-sm font-semibold text-[#344f57] dark:text-[#e2ebeb]">{common("businessDemo")}</div></div><div className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#577a83] shadow-sm dark:bg-[#2b4248] dark:text-[#d2e1de]">{t("previewCount")}</div></div>
            <div className="relative space-y-3 pb-1"><div className="timeline-line absolute bottom-3 left-[3.45rem] top-3 w-px bg-[#e4ebe8] dark:bg-white/10" />
              {(["serviceHaircut", "serviceRefresh", "serviceStyling"] as const).map((service, index) => {
                const appointment = previewAppointments[index]!
                return <div key={appointment.time} className="relative grid grid-cols-[3rem_1fr] gap-3"><div className="pt-3 text-xs font-medium tabular-nums text-[#809194]">{appointment.time}</div><div className="relative rounded-2xl border border-[#edf1ef] bg-white px-4 py-3.5 shadow-[0_2px_8px_rgba(40,70,73,.035)] dark:border-white/10 dark:bg-[#253a41]"><span className="absolute bottom-3 left-0 top-3 w-1 rounded-full" style={{ backgroundColor: appointment.color }} /><div className="font-semibold text-[#344f57] dark:text-white">{appointment.name}</div><div className="mt-1 text-xs text-[#829193]">{common(service)} · 60 {t("minutes")}</div></div></div>
              })}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[#edf1ef] pt-4 text-sm dark:border-white/10"><span className="text-[#708386]">{t("bookingLinkHint")}</span><span className="rounded-full bg-[#e9f2ef] px-3 py-2 text-xs font-semibold text-[#4a716f] dark:bg-white/10 dark:text-[#c4ddda]">editfodraszat.{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000"}</span></div>
          </div>
          <div className="float-card absolute -left-8 bottom-12 hidden items-center gap-3 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_48px_rgba(48,79,86,.12)] sm:flex dark:border-white/10 dark:bg-[#1d3037]"><span className="flex size-10 items-center justify-center rounded-xl bg-[#edf5f1] text-[#5b8c7c]" aria-hidden="true">✓</span><span className="text-sm font-semibold text-[#3d5960] dark:text-white">{t("featureSimple")}</span></div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 pb-16 sm:grid-cols-3 sm:px-8 lg:px-12 lg:pb-24">
        {(["featureSimple", "featureClear", "featureBooking"] as const).map((key, index) => <article key={key} className="rounded-3xl border border-[#e3ebea] bg-white/55 p-6 dark:border-white/10 dark:bg-white/[.03]"><div className="mb-7 flex size-11 items-center justify-center rounded-2xl bg-[#e9f2ef] text-lg text-[#547e80] dark:bg-white/10 dark:text-[#c4d9d6]" aria-hidden="true">{["↗", "◷", "♡"][index]}</div><h2 className="text-lg font-semibold tracking-tight text-[#29434c] dark:text-white">{t(key)}</h2><p className="mt-2 leading-7 text-[#748589] dark:text-[#b1c0c3]">{t(`${key}Text`)}</p></article>)}
      </section>
      <footer className="mx-auto flex max-w-7xl items-center justify-between border-t border-[#dde6e5] px-5 py-6 text-sm text-[#798b8e] sm:px-8 lg:px-12 dark:border-white/10"><BrandLockup compact /><span>{t("footer")}</span></footer>
    </main>
  )
}
