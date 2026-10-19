import { notFound } from "next/navigation"
import { NextIntlClientProvider } from "next-intl"
import { cookies } from "next/headers"
import { PublicBookingFlow } from "@/components/public-booking-flow"
import { getPublicTenant } from "@/lib/server/public-booking"

export default async function PublicBookingPage({ params }: PageProps<"/booking/[slug]">) {
  const { slug } = await params
  const tenant = await getPublicTenant(slug)
  if (!tenant) notFound()
  const cookieStore = await cookies()
  const locale = cookieStore.get("tempo-locale")?.value === "en" ? "en" : tenant.locale
  const messages = (await import(`../../../messages/${locale}.json`)).default
  return <NextIntlClientProvider locale={locale} messages={messages}><PublicBookingFlow tenant={tenant} /></NextIntlClientProvider>
}
