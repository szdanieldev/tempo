import { verifyWebhook } from "@clerk/nextjs/webhooks"
import { NextResponse, type NextRequest } from "next/server"
import { validateSlug } from "@/lib/slug"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { claimWebhookEvent } from "@/lib/server/webhook-events"

type ClerkEvent = { id: string; type: string; data: Record<string, unknown> }
type ClerkOrganization = { id: string; name: string; slug: string }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

async function syncOrganization(client: NonNullable<ReturnType<typeof createServiceSupabaseClient>>, organization: ClerkOrganization) {
  if (!organization.id || !organization.name || !validateSlug(organization.slug).valid) throw new Error("invalid_organization")
  const { data: existing, error: lookupError } = await client.from("organizations").select("id").eq("id", organization.id).maybeSingle()
  if (lookupError) throw lookupError
  const result = existing
    ? await client.from("organizations").update({ name: organization.name, slug: organization.slug }).eq("id", organization.id)
    : await client.from("organizations").insert({ id: organization.id, name: organization.name, slug: organization.slug })
  if (result.error) throw result.error
}

export async function POST(request: NextRequest) {
  let event: ClerkEvent
  try {
    event = await verifyWebhook(request) as unknown as ClerkEvent
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 })
  }
  const client = createServiceSupabaseClient()
  if (!client) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })
  if (!event.id || !event.type) return NextResponse.json({ error: "invalid_event" }, { status: 400 })

  let claimed: boolean
  try {
    claimed = await claimWebhookEvent(client, { id: event.id, provider: "clerk", type: event.type, payload: event })
  } catch {
    return NextResponse.json({ error: "event_store_failed" }, { status: 500 })
  }
  if (!claimed) return NextResponse.json({ received: true, duplicate: true })

  try {
    const data = asRecord(event.data)
    if (event.type === "organization.created" || event.type === "organization.updated") {
      await syncOrganization(client, { id: String(data.id ?? ""), name: String(data.name ?? ""), slug: String(data.slug ?? "") })
    } else if (event.type === "organization.deleted") {
      if (typeof data.id === "string") await client.from("organizations").delete().eq("id", data.id)
    } else if (["organizationMembership.created", "organizationMembership.updated", "organization_membership.created", "organization_membership.updated"].includes(event.type)) {
      const organizationData = asRecord(data.organization)
      const organizationId = String(data.organization_id ?? organizationData.id ?? "")
      const organization = { id: organizationId, name: String(organizationData.name ?? ""), slug: String(organizationData.slug ?? "") }
      if (organization.name && organization.slug) await syncOrganization(client, organization)
      else if (!organizationId) throw new Error("missing_organization")
      const publicUserData = asRecord(data.public_user_data ?? data.publicUserData)
      const userId = String(publicUserData.user_id ?? data.user_id ?? "")
      if (!userId) throw new Error("missing_user")
      const displayName = [publicUserData.first_name ?? publicUserData.firstName, publicUserData.last_name ?? publicUserData.lastName].filter((value) => typeof value === "string" && value.trim()).join(" ") || userId
      const identifier = String(publicUserData.identifier ?? "")
      const role = data.role === "org:admin" ? "org:admin" : "org:member"
      const { error } = await client.from("members").upsert({ org_id: organizationId, clerk_user_id: userId, display_name: displayName, email: identifier.includes("@") ? identifier : null, role, is_active: true }, { onConflict: "org_id,clerk_user_id" })
      if (error) throw error
    } else if (["organizationMembership.deleted", "organization_membership.deleted"].includes(event.type)) {
      const organizationData = asRecord(data.organization)
      const publicUserData = asRecord(data.public_user_data ?? data.publicUserData)
      const organizationId = String(data.organization_id ?? organizationData.id ?? "")
      const userId = String(publicUserData.user_id ?? data.user_id ?? "")
      if (organizationId && userId) await client.from("members").update({ is_active: false }).eq("org_id", organizationId).eq("clerk_user_id", userId)
    }
    await client.from("webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), error: null }).eq("event_id", event.id)
    return NextResponse.json({ received: true })
  } catch (error) {
    await client.from("webhook_events").update({ status: "failed", error: error instanceof Error ? error.message.slice(0, 500) : "processing_failed" }).eq("event_id", event.id)
    return NextResponse.json({ error: "processing_failed" }, { status: 500 })
  }
}
