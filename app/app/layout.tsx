import { OwnerShell } from "@/components/owner-shell"
import { getOwnerContext } from "@/lib/server/auth"

export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const owner = await getOwnerContext()
  const isAdmin = owner.isDemo || owner.role === "org:admin" || owner.role === "org:owner"
  return <OwnerShell demo={owner.isDemo} isAdmin={isAdmin}>{children}</OwnerShell>
}
