import type { MetadataRoute } from "next"
import { getLocale, getTranslations } from "next-intl/server"
import { brand } from "@/config/brand"

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getLocale()
  const t = await getTranslations({ locale, namespace: "PWA" })
  const brandText = await getTranslations({ locale, namespace: "Brand" })
  return {
    id: "/app",
    name: `${brand.name} ${brandText("byline")}`,
    short_name: brand.name,
    description: t("description"),
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#f5f8f6",
    theme_color: "#527889",
    lang: locale,
    icons: [
      { src: "/icons/tempo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/tempo-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  }
}
