import type { PaymentProvider } from "./types"

export const onSitePaymentProvider: PaymentProvider = {
  async createPayment() {
    return { providerPaymentId: null, checkoutUrl: null }
  },
  async getStatus() {
    return "pending"
  },
}
