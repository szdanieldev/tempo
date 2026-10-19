import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

export async function claimWebhookEvent(client: SupabaseClient, event: {
  id: string
  provider: "stripe" | "clerk"
  type: string
  payload: unknown
}) {
  const { data, error } = await client.rpc("claim_webhook_event", {
    p_event_id: event.id,
    p_provider: event.provider,
    p_event_type: event.type,
    p_payload: event.payload,
  })
  if (error) throw error
  return data === true
}
