import { CustomersView } from "@/components/customers-view"
import { demoCustomers } from "@/lib/domain/demo-data"
import { getOwnerContext } from "@/lib/server/auth"
import { createTenantSupabaseClient } from "@/lib/server/supabase"
import { getOrganizationTimezone } from "@/lib/server/agenda-data"

export default async function CustomersPage() {
  const owner = await getOwnerContext()
  const client = await createTenantSupabaseClient()
  const timezone = owner.orgId && !owner.isDemo ? await getOrganizationTimezone(owner.orgId) : "Europe/Budapest"
  let customers = demoCustomers
  if (client && owner.orgId && !owner.isDemo) {
    const { data } = await client.from("customers").select("id,name,phone,email,created_at").eq("org_id", owner.orgId).order("name")
    const { data: appointments } = await client.from("appointments").select("customer_id,starts_at").eq("org_id", owner.orgId).neq("status", "cancelled").order("starts_at", { ascending: false })
    const visits = new Map<string, { count: number; lastVisit: string }>()
    for (const appointment of appointments ?? []) {
      if (!appointment.customer_id) continue
      const current = visits.get(appointment.customer_id)
      visits.set(appointment.customer_id, { count: (current?.count ?? 0) + 1, lastVisit: current?.lastVisit ?? appointment.starts_at })
    }
    customers = (data ?? []).map((customer) => {
      const stats = visits.get(customer.id)
      return { id: customer.id, name: customer.name, phone: customer.phone ?? "", email: customer.email, lastVisit: stats?.lastVisit ?? customer.created_at, visits: stats?.count ?? 0 }
    })
  }
  return <CustomersView customers={customers} timezone={timezone} isAdmin={owner.isDemo || owner.role === "org:admin" || owner.role === "org:owner"} />
}
