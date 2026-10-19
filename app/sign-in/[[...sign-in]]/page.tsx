import Link from "next/link"
import { SignIn } from "@clerk/nextjs"
import { getTranslations } from "next-intl/server"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"

export default async function SignInPage() {
  const t = await getTranslations("Auth")
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
  return <main className="marketing-shell flex min-h-svh flex-col"><header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8"><Link href="/"><BrandLockup /></Link><LanguageSwitcher compact /></header><div className="flex flex-1 items-center justify-center px-5 py-12"><div className="w-full max-w-md rounded-[2rem] border border-white/80 bg-white/90 p-7 shadow-[0_28px_90px_rgba(48,79,86,.14)] sm:p-9 dark:border-white/10 dark:bg-[#1d3037]"><h1 className="text-3xl font-semibold tracking-tight text-[#263f49] dark:text-white">{t("signInTitle")}</h1><p className="mt-2 text-base leading-7 text-[#718487] dark:text-[#b4c2c4]">{t("signInDescription")}</p>{configured ? <div className="mt-7 flex justify-center"><SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" forceRedirectUrl="/app" /></div> : <div className="mt-7"><p className="mb-4 rounded-2xl bg-[#f2f7f4] p-4 text-sm text-[#607b7d] dark:bg-white/5 dark:text-[#c3d1d0]">{t("demoNotice")}</p><Link href="/app" className="flex min-h-14 w-full items-center justify-center rounded-full bg-[#416e7e] px-6 font-semibold text-white">{t("openAgenda")}</Link></div>}<Link href="/" className="mt-6 flex min-h-11 items-center justify-center text-sm font-medium text-[#718487]">{t("backHome")}</Link></div></div></main>
}
