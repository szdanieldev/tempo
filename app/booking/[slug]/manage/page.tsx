import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import { NextIntlClientProvider } from "next-intl"
import { ManageBookingView } from "@/components/manage-booking-view"
import { getPublicTenant } from "@/lib/server/public-booking"

export default async function ManagePage({ params }: PageProps<"/booking/[slug]/manage">) {
  const { slug } = await params
  const tenant = await getPublicTenant(slug)
  if (!tenant) notFound()
  const cookieStore = await cookies()
  const locale = cookieStore.get("tempo-locale")?.value === "en" ? "en" : tenant.locale
  const messages = (await import(`../../../../messages/${locale}.json`)).default
  return <NextIntlClientProvider locale={locale} messages={messages}><ManageBookingView slug={slug} /></NextIntlClientProvider>
}
