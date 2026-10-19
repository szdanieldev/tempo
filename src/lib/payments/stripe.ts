import "server-only"
import Stripe from "stripe"
import type { PaymentCreateInput, PaymentProvider } from "./types"

let stripeClient: Stripe | null = null

export function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured")
  stripeClient ??= new Stripe(process.env.STRIPE_SECRET_KEY)
  return stripeClient
}

export const stripePaymentProvider: PaymentProvider = {
  async createPayment(input: PaymentCreateInput) {
    if (!input.connectedAccountId) throw new Error("A connected Stripe account is required")
    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      customer_email: input.customerEmail,
      client_reference_id: input.appointmentId,
      metadata: { org_id: input.orgId, appointment_id: input.appointmentId },
      payment_intent_data: {
        transfer_data: { destination: input.connectedAccountId },
        metadata: { org_id: input.orgId, appointment_id: input.appointmentId },
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "huf",
          unit_amount: input.amountHuf,
          product_data: { name: input.serviceName, description: input.organizationName },
        },
      }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    }, { idempotencyKey: `tempo-appointment-${input.appointmentId}` })
    return { providerPaymentId: session.id, checkoutUrl: session.url }
  },

  handleWebhook(rawBody, signature, signingSecret) {
    return getStripeClient().webhooks.constructEvent(rawBody, signature, signingSecret)
  },

  async refund(providerPaymentId, amountHuf) {
    const paymentIntent = providerPaymentId.startsWith("cs_")
      ? await getStripeClient().checkout.sessions.retrieve(providerPaymentId).then((session) => session.payment_intent)
      : providerPaymentId
    if (typeof paymentIntent !== "string") throw new Error("Payment intent is not available")
    const refund = await getStripeClient().refunds.create({ payment_intent: paymentIntent, reverse_transfer: true, ...(amountHuf ? { amount: amountHuf } : {}) }, { idempotencyKey: `tempo-refund-${paymentIntent}-${amountHuf ?? "full"}` })
    return { providerRefundId: refund.id }
  },

  async expirePayment(providerPaymentId) {
    if (providerPaymentId.startsWith("cs_")) {
      const session = await getStripeClient().checkout.sessions.retrieve(providerPaymentId)
      if (session.status === "open") await getStripeClient().checkout.sessions.expire(providerPaymentId)
    }
  },

  async getStatus(providerPaymentId) {
    if (providerPaymentId.startsWith("cs_")) {
      const session = await getStripeClient().checkout.sessions.retrieve(providerPaymentId)
      return session.payment_status
    }
    const paymentIntent = await getStripeClient().paymentIntents.retrieve(providerPaymentId)
    return paymentIntent.status
  },
}
