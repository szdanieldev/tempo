import { ServicesView } from "@/components/services-view"
import { demoServices } from "@/lib/domain/demo-data"
import { getAgendaData, getLocalDateString, getOrganizationTimezone } from "@/lib/server/agenda-data"
import { getOwnerContext } from "@/lib/server/auth"

export default async function ServicesPage() {
  const owner = await getOwnerContext()
  const timezone = owner.orgId && !owner.isDemo ? await getOrganizationTimezone(owner.orgId) : "Europe/Budapest"
  const { services } = await getAgendaData(getLocalDateString(new Date(), timezone))
  return <ServicesView initialServices={services.length ? services : demoServices} demo={owner.isDemo} isAdmin={owner.isDemo || owner.role === "org:admin" || owner.role === "org:owner"} />
}
