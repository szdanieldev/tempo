import { handleStripeWebhook } from "@/lib/payments/webhook-handler"

export async function POST(request: Request) {
  return handleStripeWebhook(request, process.env.STRIPE_CONNECT_WEBHOOK_SECRET)
}
