import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { auth } from "@clerk/nextjs/server"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonymousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export async function createTenantSupabaseClient(): Promise<SupabaseClient | null> {
  if (!supabaseUrl || !anonymousKey || !process.env.CLERK_SECRET_KEY) return null

  const session = await auth()
  if (!session.userId) return null

  return createClient(supabaseUrl, anonymousKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    accessToken: async () => session.getToken(),
  })
}

export function createServiceSupabaseClient(): SupabaseClient | null {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function supabaseIsConfigured() {
  return Boolean(supabaseUrl && anonymousKey && serviceRoleKey)
}
