import { AgendaView } from "@/components/agenda-view"
import { getLocalDateString, getAgendaData, getOrganizationTimezone } from "@/lib/server/agenda-data"
import { getOwnerContext } from "@/lib/server/auth"

export default async function AgendaPage() {
  const owner = await getOwnerContext()
  const timezone = owner.orgId && !owner.isDemo ? await getOrganizationTimezone(owner.orgId) : "Europe/Budapest"
  const today = getLocalDateString(new Date(), timezone)
  const data = await getAgendaData(today)
  return <AgendaView initialAppointments={data.appointments} services={data.services} staffMembers={data.staffMembers} currentStaffId={data.currentStaffId} canAssignStaff={data.canAssignStaff} cacheNamespace={owner.orgId ?? "demo"} today={today} timezone={data.timezone} demo={data.demo} />
}
