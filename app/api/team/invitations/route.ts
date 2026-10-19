import { clerkClient } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { getOwnerContext, isOrganizationAdmin } from "@/lib/server/auth"
import { teamInviteSchema } from "@/lib/validation"

export async function POST(request: Request) {
  const owner = await getOwnerContext()
  if (!owner.orgId || !owner.userId || !isOrganizationAdmin(owner.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const parsed = teamInviteSchema.safeParse(
    await request.json().catch(() => null)
  )
  if (!parsed.success)
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  try {
    const origin = process.env.APP_URL || new URL(request.url).origin
    await (
      await clerkClient()
    ).organizations.createOrganizationInvitation({
      organizationId: owner.orgId,
      emailAddress: parsed.data.email,
      role: "org:member",
      inviterUserId: owner.userId,
      redirectUrl: `${origin}/app`,
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: "could_not_send_invite" },
      { status: 502 }
    )
  }
}
