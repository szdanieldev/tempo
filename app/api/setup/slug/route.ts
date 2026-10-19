import { clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getOwnerContext } from "@/lib/server/auth"
import { createServiceSupabaseClient } from "@/lib/server/supabase"
import { validateSlug } from "@/lib/slug"

function isNotFound(error: unknown) {
  if (!error || typeof error !== "object") return false
  const record = error as { status?: number; statusCode?: number; errors?: Array<{ code?: string }> }
  return record.status === 404 || record.statusCode === 404 || record.errors?.some((item) => item.code === "resource_not_found") === true
}

export async function GET(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.userId || owner.isDemo) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? ""
  const validation = validateSlug(slug)
  if (!validation.valid) return NextResponse.json({ available: false, error: "invalid_slug" })

  const database = createServiceSupabaseClient()
  if (!database) return NextResponse.json({ error: "database_unavailable" }, { status: 503 })

  let matchingOrganizationId: string | null = null
  try {
    const clerk = await clerkClient()
    try {
      const organization = await clerk.organizations.getOrganization({ slug })
      const membership = await clerk.organizations.getOrganizationMembershipList({
        organizationId: organization.id,
        userId: [owner.userId],
        limit: 1,
      })
      const isAdmin = membership.data.some((item) => item.role === "org:admin" || item.role === "org:owner")
      if (organization.id !== owner.orgId && !isAdmin) {
        return NextResponse.json({ available: false, error: "slug_in_use" })
      }
      matchingOrganizationId = organization.id
    } catch (error) {
      if (!isNotFound(error)) return NextResponse.json({ error: "organization_lookup_failed" }, { status: 502 })
    }
  } catch {
    return NextResponse.json({ error: "clerk_unavailable" }, { status: 503 })
  }

  const { data: existing, error } = await database.from("organizations").select("id").eq("slug", slug).maybeSingle()
  if (error) return NextResponse.json({ error: "organization_lookup_failed" }, { status: 500 })
  const currentOrganizationId = owner.orgId ?? matchingOrganizationId
  if (existing && existing.id !== currentOrganizationId) {
    return NextResponse.json({ available: false, error: "slug_in_use" })
  }

  return NextResponse.json({ available: true })
}
