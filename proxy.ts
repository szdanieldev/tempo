import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse, type NextRequest } from "next/server"
import { getTenantSlugFromHost } from "@/lib/slug"

function routeTenant(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next()
  const slug = getTenantSlugFromHost(request.headers.get("host") ?? request.nextUrl.host)
  if (!slug) return NextResponse.next()

  const destination = request.nextUrl.clone()
  destination.pathname = `/booking/${slug}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`
  return NextResponse.rewrite(destination)
}

const clerkProxy = clerkMiddleware(async (auth, request) => {
  const tenantResponse = routeTenant(request)
  if (tenantResponse.headers.get("x-middleware-rewrite")) return tenantResponse

  if (request.nextUrl.pathname.startsWith("/app") || request.nextUrl.pathname === "/setup") {
    const session = await auth()
    if (!session.userId) {
      const signInUrl = new URL("/sign-in", request.url)
      signInUrl.searchParams.set("redirect_url", request.url)
      return NextResponse.redirect(signInUrl)
    }
  }

  return tenantResponse
})

export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY ? clerkProxy : routeTenant

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ico|woff2?|ttf|map|txt|webmanifest)).*)", "/(api|trpc)(.*)"],
}
