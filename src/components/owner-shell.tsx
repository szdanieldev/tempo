"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Button } from "@/components/ui/button"

const destinations = [
  { href: "/app", key: "agenda", icon: "◷" },
  { href: "/app/services", key: "services", icon: "✳" },
  { href: "/app/customers", key: "customers", icon: "♡" },
  { href: "/app/settings", key: "settings", icon: "⚙" },
] as const

export function OwnerShell({ children, demo = true, isAdmin = true }: { children: React.ReactNode; demo?: boolean; isAdmin?: boolean }) {
  const pathname = usePathname()
  const t = useTranslations("Navigation")
  const common = useTranslations("Common")
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"
  const isActive = (href: string) => href === "/app" ? pathname === href : pathname.startsWith(href)
  const visibleDestinations = destinations.filter((destination) => isAdmin || !["/app/services", "/app/settings"].includes(destination.href))
  const themeButton = <Button type="button" variant="ghost" size="icon" className="size-11" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={isDark ? t("lightMode") : t("darkMode")}>{isDark ? "☼" : "☾"}</Button>

  return <div className="min-h-svh bg-background text-foreground">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background px-4 py-5 lg:flex">
      <Link href="/app" aria-label={common("businessDemo")} className="mb-8 px-2"><BrandLockup /></Link>
      <div className="mb-5 rounded-md bg-muted px-3 py-3"><div className="font-medium">{common("businessDemo")}</div>{demo && <div className="mt-1 text-sm text-muted-foreground">{common("demoMode")}</div>}</div>
      <nav className="space-y-1" aria-label={t("menu")}>
        {visibleDestinations.map((destination) => <Link key={destination.href} href={destination.href} aria-current={isActive(destination.href) ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-base transition-colors ${isActive(destination.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}><span className="flex size-7 items-center justify-center" aria-hidden="true">{destination.icon}</span>{t(destination.key)}</Link>)}
      </nav>
      <div className="mt-auto space-y-2 px-1"><LanguageSwitcher compact /><Button type="button" variant="ghost" className="min-h-11 w-full justify-start gap-3" onClick={() => setTheme(isDark ? "light" : "dark")}><span aria-hidden="true">{isDark ? "☼" : "☾"}</span>{isDark ? t("lightMode") : t("darkMode")}</Button><div className="px-3 pt-1 text-sm text-muted-foreground">{common("ownerDemo")}</div></div>
    </aside>
    <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:ml-60 lg:px-8">
      <Link href="/app" aria-label={common("businessDemo")} className="lg:hidden"><BrandLockup compact /></Link>
      <div className="hidden text-sm font-medium text-muted-foreground lg:block">{common("businessDemo")}</div>
      <div className="flex items-center gap-2"><div className="lg:hidden"><LanguageSwitcher compact /></div>{themeButton}</div>
    </header>
    <div className="pb-20 lg:ml-60 lg:pb-0"><main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main></div>
    <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background px-1 pb-[max(env(safe-area-inset-bottom),.35rem)] pt-1 lg:hidden" aria-label={t("menu")}>
      {visibleDestinations.map((destination) => <Link key={destination.href} href={destination.href} aria-current={isActive(destination.href) ? "page" : undefined} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-md text-xs ${isActive(destination.href) ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}><span className="flex size-7 items-center justify-center text-base" aria-hidden="true">{destination.icon}</span><span>{t(destination.key)}</span></Link>)}
    </nav>
  </div>
}
