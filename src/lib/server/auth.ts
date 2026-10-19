import { auth } from "@clerk/nextjs/server"

export type OwnerContext = {
  orgId: string | null
  userId: string | null
  role: string | null
  isDemo: boolean
}

export async function getOwnerContext(): Promise<OwnerContext> {
  const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
  if (!clerkConfigured && process.env.NODE_ENV !== "production") {
    return { orgId: "demo-org", userId: "demo-user", role: "org:admin", isDemo: true }
  }
  if (!clerkConfigured) return { orgId: null, userId: null, role: null, isDemo: false }

  const session = await auth()
  return {
    orgId: session.orgId ?? null,
    userId: session.userId ?? null,
    role: session.orgRole ?? null,
    isDemo: false,
  }
}

export function isOrganizationAdmin(role: string | null) {
  return role === "org:admin" || role === "org:owner"
}
