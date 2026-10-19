import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const requestedLocale = cookieStore.get("tempo-locale")?.value
  const locale = requestedLocale === "en" ? "en" : "hu"

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  }
})
