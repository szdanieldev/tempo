import { ClerkSetupWizard, DemoSetupWizard } from "@/components/setup-wizard"
import { headers } from "next/headers"

export default async function SetupPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
  const requestHeaders = await headers()
  const host = requestHeaders.get("host")?.toLowerCase() ?? ""
  const rootDomain = /(?:^|\.)localhost(?::\d+)?$/.test(host)
    ? (host.startsWith("localhost") ? host : "localhost" + (host.match(/:\d+$/)?.[0] ?? ":3000"))
    : (process.env.NEXT_PUBLIC_ROOT_DOMAIN || process.env.ROOT_DOMAIN || "localhost:3000").replace(/^https?:\/\//, "").replace(/\/$/, "")
  return configured ? <ClerkSetupWizard rootDomain={rootDomain} /> : <DemoSetupWizard rootDomain={rootDomain} />
}
