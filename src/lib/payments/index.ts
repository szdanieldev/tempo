import type { PaymentProvider } from "./types"
import { onSitePaymentProvider } from "./on-site"
import { stripePaymentProvider } from "./stripe"

export type PaymentMethod = "on_site" | "stripe"

export function getPaymentProvider(method: PaymentMethod): PaymentProvider {
  if (method === "on_site") return onSitePaymentProvider
  if (method === "stripe") return stripePaymentProvider
  throw new Error("Unsupported payment provider. Add a provider adapter here without changing booking logic.")
}
