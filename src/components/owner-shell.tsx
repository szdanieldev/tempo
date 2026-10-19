"use client"
import { Button } from "@/components/ui/button"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"

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

  function isActive(href: string) {
    return href === "/app" ? pathname === href : pathname.startsWith(href)
  }

  const visibleDestinations = destinations.filter((destination) => isAdmin || !["/app/services", "/app/settings"].includes(destination.href))

  return (
    <div className="owner-app min-h-svh bg-[#f5f8f7] text-[#273d45] dark:bg-[#13252b] dark:text-white">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-[#e1e9e7] bg-[#fbfcfb] px-5 py-6 dark:border-white/10 dark:bg-[#192c32] lg:flex">
        <Link href="/app" aria-label={common("businessDemo")} className="mb-10 px-2 text-lg"><BrandLockup /></Link>
        <div className="mb-6 rounded-2xl bg-[#f0f5f2] px-4 py-3 dark:bg-white/5"><div className="text-sm font-semibold">{common("businessDemo")}</div>{demo && <div className="mt-1 text-xs text-[#788d8d] dark:text-[#a8bbbb]">{common("demoMode")}</div>}</div>
        <nav className="space-y-1" aria-label={t("menu")}>
          {visibleDestinations.map((destination) => <Link key={destination.href} href={destination.href} aria-current={isActive(destination.href) ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition ${isActive(destination.href) ? "bg-[#e9f1ee] text-[#315d69] dark:bg-white/10 dark:text-[#c8e0df]" : "text-[#718184] hover:bg-[#f1f5f3] hover:text-[#344d55] dark:text-[#adbec0] dark:hover:bg-white/5 dark:hover:text-white"}`}><span className="flex size-8 items-center justify-center text-lg" aria-hidden="true">{destination.icon}</span>{t(destination.key)}</Link>)}
        </nav>
        <div className="mt-auto space-y-3 px-2">
          <LanguageSwitcher compact />
          <Button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-[#708184] hover:bg-[#f1f5f3] dark:text-[#b5c4c5] dark:hover:bg-white/5"><span aria-hidden="true">{isDark ? "☼" : "☾"}</span>{isDark ? t("lightMode") : t("darkMode")}</Button>
          <div className="px-3 pt-2 text-xs text-[#879697]">{common("ownerDemo")}</div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex min-h-[68px] items-center justify-between border-b border-[#e1e9e7] bg-[#fbfcfb]/95 px-4 backdrop-blur-md dark:border-white/10 dark:bg-[#192c32]/95 sm:px-7 lg:ml-[250px] lg:px-10">
        <Link href="/app" aria-label={common("businessDemo")} className="text-base lg:hidden"><BrandLockup compact /></Link>
        <div className="hidden lg:block text-sm font-medium text-[#829193]">{common("businessDemo")}</div>
        <div className="flex items-center gap-3"><div className="lg:hidden"><LanguageSwitcher compact /></div><Button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} aria-label={isDark ? t("lightMode") : t("darkMode")} className="flex size-11 items-center justify-center rounded-full border border-[#e1e9e7] bg-white text-lg text-[#547984] hover:bg-[#f1f5f3] dark:border-white/10 dark:bg-white/5 dark:text-[#c4d9d8]">{isDark ? "☼" : "☾"}</Button></div>
      </header>
      <div className="pb-24 lg:ml-[250px] lg:pb-0"><main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-7 sm:py-8 lg:px-10 lg:py-10">{children}</main></div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[#e1e9e7] bg-[#fbfcfb]/95 px-1 pb-[max(env(safe-area-inset-bottom),.35rem)] pt-1 backdrop-blur-xl dark:border-white/10 dark:bg-[#192c32]/95 lg:hidden" aria-label={t("menu")}>
        {visibleDestinations.map((destination) => <Link key={destination.href} href={destination.href} aria-current={isActive(destination.href) ? "page" : undefined} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium ${isActive(destination.href) ? "text-[#3c7080] dark:text-[#c0dcdb]" : "text-[#859394] dark:text-[#9aadaf]"}`}><span className={`flex size-8 items-center justify-center rounded-xl text-lg ${isActive(destination.href) ? "bg-[#e9f1ee] dark:bg-white/10" : ""}`} aria-hidden="true">{destination.icon}</span><span>{t(destination.key)}</span></Link>)}
      </nav>
    </div>
  )
}
