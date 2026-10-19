import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { locale?: string } | null
  if (body?.locale !== "hu" && body?.locale !== "en") return NextResponse.json({ error: "invalid_locale" }, { status: 400 })
  const cookieStore = await cookies()
  cookieStore.set("tempo-locale", body.locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true })
  return NextResponse.json({ ok: true })
}
