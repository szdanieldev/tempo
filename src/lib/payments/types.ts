import type Stripe from "stripe"

export type PaymentCreateInput = {
  orgId: string
  organizationName: string
  connectedAccountId?: string | null
  appointmentId: string
  serviceName: string
  amountHuf: number
  customerEmail: string
  successUrl: string
  cancelUrl: string
}

export type PaymentProvider = {
  createPayment(input: PaymentCreateInput): Promise<{ providerPaymentId: string | null; checkoutUrl: string | null }>
  handleWebhook?(rawBody: string, signature: string, signingSecret: string): Stripe.Event | null
  refund?(providerPaymentId: string, amountHuf?: number): Promise<{ providerRefundId: string }>
  expirePayment?(providerPaymentId: string): Promise<void>
  getStatus?(providerPaymentId: string): Promise<string>
}
