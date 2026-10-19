import Link from "next/link"
import { SignUp } from "@clerk/nextjs"
import { getTranslations } from "next-intl/server"
import { BrandLockup } from "@/components/brand-lockup"
import { LanguageSwitcher } from "@/components/language-switcher"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { buttonVariants } from "@/components/ui/button"

export default async function SignUpPage() {
  const t = await getTranslations("Auth")
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
  return <main className="flex min-h-svh flex-col bg-background"><header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6"><Link href="/"><BrandLockup /></Link><LanguageSwitcher compact /></header><div className="flex flex-1 items-center justify-center px-4 py-8"><Card className="w-full max-w-md"><CardHeader><CardTitle className="text-2xl">{t("signUpTitle")}</CardTitle><p className="text-base text-muted-foreground">{t("signUpDescription")}</p></CardHeader><CardContent>{configured ? <div className="flex justify-center"><SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/setup" /></div> : <div><p className="mb-4 rounded-md bg-muted p-4 text-base text-muted-foreground">{t("demoNotice")}</p><Link href="/setup" className={buttonVariants({ className: "min-h-12 w-full" })}>{t("continue")}</Link></div>}<Link href="/" className={buttonVariants({ variant: "ghost", className: "mt-4 min-h-11 w-full" })}>{t("backHome")}</Link></CardContent></Card></div></main>
}
