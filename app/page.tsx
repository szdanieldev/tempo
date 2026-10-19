import Link from "next/link"
import { headers } from "next/headers"
import { getTranslations } from "next-intl/server"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { brand } from "@/config/brand"

export default async function Page() {
  const t = await getTranslations("Marketing")
  const common = await getTranslations("Common")
  const host = (await headers()).get("host") ?? ""
  const localHost = host.match(/^(?:[a-z0-9-]+\.)?localhost(?::\d+)?$/i)
  const rootDomain = localHost
    ? (host.startsWith("localhost") ? host : `localhost${host.match(/:\d+$/)?.[0] ?? ":3000"}`)
    : (process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000").replace(/^https?:\/\//, "").replace(/\/$/, "")

  const appointments = [
    { time: t("previewTimeOne"), name: t("previewNameOne"), service: common("serviceHaircut") },
    { time: t("previewTimeTwo"), name: t("previewNameTwo"), service: common("serviceRefresh") },
    { time: t("previewTimeThree"), name: t("previewNameThree"), service: common("serviceStyling") },
  ]

  return (
    <main className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" aria-label={brand.name}><BrandLockup /></Link>
        <nav className="flex items-center gap-2" aria-label={t("signIn")}>
          <LanguageSwitcher compact />
          <Link href="/sign-in" className={buttonVariants({ variant: "ghost", className: "min-h-11" })}>{t("signIn")}</Link>
          <Link href="/sign-up" className={buttonVariants({ className: "min-h-11" })}>{t("start")}</Link>
        </nav>
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 sm:py-16 lg:grid-cols-2 lg:py-20">
        <div>
          <Badge variant="secondary" className="mb-5">{t("eyebrow")}</Badge>
          <h1 className="max-w-xl whitespace-pre-line text-4xl font-semibold tracking-tight sm:text-5xl">{t("title")}</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">{t("description")}</p>
          <div className="mt-7 flex flex-wrap items-center gap-4">
            <Link href="/sign-up" className={buttonVariants({ size: "lg", className: "min-h-12" })}>{t("start")}</Link>
            <span className="text-sm text-muted-foreground">{t("footer")}</span>
          </div>
          <ul className="mt-10 grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
            {(["featureSimple", "featureClear", "featureBooking"] as const).map((feature) => (
              <li key={feature} className="border-t pt-3">{t(feature)}</li>
            ))}
          </ul>
        </div>

        <Card className="w-full max-w-xl justify-self-center">
          <CardHeader className="border-b">
            <p className="text-sm text-muted-foreground">{t("preview")}</p>
            <CardTitle className="text-xl">{t("today")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-5">
            <div className="mb-4 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">{common("businessDemo")}</span>
              <Badge variant="outline">{t("previewCount")}</Badge>
            </div>
            {appointments.map(({ time, name, service }) => (
              <div key={time} className="grid grid-cols-[3.5rem_1fr] items-start gap-3">
                <time className="pt-3 text-sm tabular-nums text-muted-foreground">{time}</time>
                <div className="rounded-md border border-l-4 border-l-primary bg-card px-4 py-3">
                  <p className="font-medium">{name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{service} · 60 {t("minutes")}</p>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm">
              <span className="text-muted-foreground">{t("bookingLinkHint")}</span>
              <span className="font-medium">editfodraszat.{rootDomain}</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 border-t px-4 py-5 text-sm text-muted-foreground sm:px-6">
        <BrandLockup compact />
        <span>{t("footer")}</span>
      </footer>
    </main>
  )
}
