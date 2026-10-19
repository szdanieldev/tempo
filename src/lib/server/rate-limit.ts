import "server-only"
import { createHash } from "node:crypto"
import { createServiceSupabaseClient } from "@/lib/server/supabase"

type Bucket = { timestamps: number[] }
const buckets = new Map<string, Bucket>()

export async function allowRequest(key: string, limit = 12, windowMs = 60_000, now = Date.now()) {
  const service = createServiceSupabaseClient()
  if (service) {
    const bucketKey = createHash("sha256").update(key).digest("hex")
    const { data, error } = await service.rpc("consume_rate_limit", { p_bucket_key: bucketKey, p_limit: limit, p_window_seconds: Math.ceil(windowMs / 1000) })
    if (!error && typeof data === "boolean") return data
  }
  const previous = buckets.get(key)?.timestamps ?? []
  const current = previous.filter((timestamp) => now - timestamp < windowMs)
  if (current.length >= limit) {
    buckets.set(key, { timestamps: current })
    return false
  }
  current.push(now)
  buckets.set(key, { timestamps: current })
  return true
}

export function getRequestIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown"
}
