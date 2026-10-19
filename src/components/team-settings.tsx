"use client"

import { useEffect, useMemo, useState } from "react"
import { formatInTimeZone } from "date-fns-tz"
import { useLocale, useTranslations } from "next-intl"

type Member = {
  id: string
  displayName: string
  email: string | null
  role: string
}
type StoredHour = {
  member_id: string | null
  weekday: number
  opens_at: string
  closes_at: string
  is_closed: boolean
}
type StoredTimeOff = {
  id: string
  member_id: string | null
  starts_at: string
  ends_at: string
  reason: string | null
}
type TeamData = {
  members: Member[]
  workingHours: StoredHour[]
  timeOff: StoredTimeOff[]
  currentMemberId?: string
  demo?: boolean
}
type Hour = {
  weekday: number
  opensAt: string
  closesAt: string
  isClosed: boolean
}

function defaultSchedule(): Hour[] {
  return Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    opensAt: "09:00",
    closesAt: "17:00",
    isClosed: weekday === 0 || weekday === 6,
  }))
}

function inputDate(timezone: string) {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd")
}

async function fetchTeamData(): Promise<TeamData> {
  const response = await fetch("/api/team", { cache: "no-store" })
  if (!response.ok) throw new Error("team_load_failed")
  return response.json() as Promise<TeamData>
}

function scheduleForMember(rows: StoredHour[], memberId: string): Hour[] {
  const stored = rows.filter((hour) => hour.member_id === memberId)
  return defaultSchedule().map((fallback) => {
    const hour = stored.find((item) => item.weekday === fallback.weekday)
    return hour
      ? {
          weekday: hour.weekday,
          opensAt: hour.opens_at.slice(0, 5),
          closesAt: hour.closes_at.slice(0, 5),
          isClosed: hour.is_closed,
        }
      : fallback
  })
}

export function TeamSettings({
  isAdmin,
  timezone,
}: {
  isAdmin: boolean
  timezone: string
}) {
  const t = useTranslations("Team")
  const locale = useLocale()
  const [data, setData] = useState<TeamData>({
    members: [],
    workingHours: [],
    timeOff: [],
  })
  const [selectedMemberId, setSelectedMemberId] = useState("")
  const [editedHours, setEditedHours] = useState<Record<string, Hour[]>>({})
  const [inviteEmail, setInviteEmail] = useState("")
  const [timeOffTarget, setTimeOffTarget] = useState("current")
  const [startDate, setStartDate] = useState(() => inputDate(timezone))
  const [endDate, setEndDate] = useState(() => inputDate(timezone))
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("17:00")
  const [reason, setReason] = useState("")
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState("")

  const members = useMemo(
    () =>
      isAdmin
        ? data.members
        : data.members.filter((member) => member.id === data.currentMemberId),
    [data.currentMemberId, data.members, isAdmin]
  )
  const selectedMember =
    members.find((member) => member.id === selectedMemberId) ?? members[0]
  const hours = useMemo(
    () =>
      selectedMember
        ? (editedHours[selectedMember.id] ??
          scheduleForMember(data.workingHours, selectedMember.id))
        : defaultSchedule(),
    [data.workingHours, editedHours, selectedMember]
  )
  const visibleTimeOff = data.timeOff.filter(
    (item) => isAdmin || item.member_id === data.currentMemberId
  )

  async function loadTeam() {
    const nextData = await fetchTeamData()
    setData(nextData)
    setSelectedMemberId((current) =>
      nextData.members.some((member) => member.id === current)
        ? current
        : (nextData.currentMemberId ?? nextData.members[0]?.id ?? "")
    )
  }

  const loadFailedMessage = t("saveFailed")
  useEffect(() => {
    let active = true
    void fetchTeamData()
      .then((nextData) => {
        if (!active) return
        setData(nextData)
        setSelectedMemberId(
          nextData.currentMemberId ?? nextData.members[0]?.id ?? ""
        )
      })
      .catch(() => {
        if (active) setFeedback(loadFailedMessage)
      })
    return () => {
      active = false
    }
  }, [loadFailedMessage])

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFeedback("")
    try {
      const response = await fetch("/api/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      })
      if (!response.ok) throw new Error("invite_failed")
      setInviteEmail("")
      setFeedback(t("inviteSent"))
    } catch {
      setFeedback(t("inviteFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function saveSchedule() {
    if (!selectedMember) return
    setBusy(true)
    setFeedback("")
    try {
      const response = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: selectedMember.id, hours }),
      })
      if (!response.ok) throw new Error("schedule_failed")
      await loadTeam()
      setFeedback(t("saved"))
    } catch {
      setFeedback(t("saveFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function addTimeOff(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setFeedback("")
    try {
      const memberId =
        timeOffTarget === "all"
          ? null
          : timeOffTarget === "current"
            ? selectedMember?.id
            : timeOffTarget
      const response = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId,
          startDate,
          startTime,
          endDate,
          endTime,
          reason: reason.trim() || null,
        }),
      })
      if (!response.ok) throw new Error("time_off_failed")
      setReason("")
      await loadTeam()
      setFeedback(t("saved"))
    } catch {
      setFeedback(t("saveFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function deleteTimeOff(id: string) {
    setBusy(true)
    setFeedback("")
    try {
      const response = await fetch("/api/team", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!response.ok) throw new Error("time_off_delete_failed")
      await loadTeam()
      setFeedback(t("saved"))
    } catch {
      setFeedback(t("saveFailed"))
    } finally {
      setBusy(false)
    }
  }

  const formatTimeOff = (item: StoredTimeOff) =>
    new Intl.DateTimeFormat(locale === "hu" ? "hu-HU" : "en-GB", {
      timeZone: timezone,
      dateStyle: "medium",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatRange(new Date(item.starts_at), new Date(item.ends_at))
  const memberName = (id: string | null) =>
    id
      ? (data.members.find((member) => member.id === id)?.displayName ?? "")
      : t("allMembers")

  if (data.demo) return null

  return (
    <section className="mt-6 space-y-5 rounded-3xl border border-[#e3ebe8] bg-white p-5 shadow-[0_4px_20px_rgba(45,75,78,.035)] sm:p-7 dark:border-white/10 dark:bg-[#1b3037]">
      <header>
        <h2 className="text-xl font-semibold text-[#334e55] dark:text-white">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[#728688]">
          {t("description")}
        </p>
      </header>
      {isAdmin && (
        <form
          onSubmit={(event) => void inviteMember(event)}
          className="rounded-2xl bg-[#f6f9f7] p-4 dark:bg-white/5"
        >
          <h3 className="font-semibold text-[#405a60] dark:text-[#dce8e6]">
            {t("inviteTitle")}
          </h3>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder={t("invitePlaceholder")}
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
            />
            <button
              type="submit"
              disabled={busy}
              className="min-h-12 rounded-xl bg-[#416e7e] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {t("invite")}
            </button>
          </div>
        </form>
      )}
      {members.length > 0 && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h3 className="text-lg font-semibold text-[#405a60] dark:text-[#dce8e6]">
              {t("scheduleTitle")}
            </h3>
            {members.length > 1 && (
              <label className="block sm:min-w-56">
                <span className="mb-2 block text-sm font-semibold">
                  {t("member")}
                </span>
                <select
                  value={selectedMember?.id ?? ""}
                  onChange={(event) => setSelectedMemberId(event.target.value)}
                  className="min-h-12 w-full rounded-xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                >
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {selectedMember && (
            <div className="space-y-2">
              {hours.map((hour) => (
                <div
                  key={hour.weekday}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-[#edf1ef] p-3 sm:grid-cols-[1fr_auto_auto_auto] dark:border-white/10"
                >
                  <span className="font-medium text-[#496267] dark:text-[#d0dedd]">
                    {t(`day${hour.weekday}`)}
                  </span>
                  {hour.isClosed ? (
                    <span className="text-sm text-[#829193]">
                      {t("closed")}
                    </span>
                  ) : (
                    <>
                      <input
                        type="time"
                        aria-label={`${t(`day${hour.weekday}`)} ${t("startTime")}`}
                        value={hour.opensAt}
                        onChange={(event) =>
                          setEditedHours((current) => ({
                            ...current,
                            [selectedMember.id]: hours.map((item) =>
                              item.weekday === hour.weekday
                                ? { ...item, opensAt: event.target.value }
                                : item
                            ),
                          }))
                        }
                        className="min-h-11 rounded-lg border border-[#dce6e3] bg-white px-2 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                      />
                      <input
                        type="time"
                        aria-label={`${t(`day${hour.weekday}`)} ${t("endTime")}`}
                        value={hour.closesAt}
                        onChange={(event) =>
                          setEditedHours((current) => ({
                            ...current,
                            [selectedMember.id]: hours.map((item) =>
                              item.weekday === hour.weekday
                                ? { ...item, closesAt: event.target.value }
                                : item
                            ),
                          }))
                        }
                        className="min-h-11 rounded-lg border border-[#dce6e3] bg-white px-2 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
                      />
                    </>
                  )}
                  <label className="flex min-h-11 items-center justify-end gap-2 text-sm">
                    <span>{t("closed")}</span>
                    <input
                      type="checkbox"
                      checked={hour.isClosed}
                      onChange={(event) =>
                        setEditedHours((current) => ({
                          ...current,
                          [selectedMember.id]: hours.map((item) =>
                            item.weekday === hour.weekday
                              ? { ...item, isClosed: event.target.checked }
                              : item
                          ),
                        }))
                      }
                      className="size-5 accent-[#416e7e]"
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={!selectedMember || busy}
            onClick={() => void saveSchedule()}
            className="min-h-12 rounded-full bg-[#416e7e] px-6 text-sm font-semibold text-white disabled:opacity-50"
          >
            {t("saveSchedule")}
          </button>
        </>
      )}
      <div className="border-t border-[#edf1ef] pt-5 dark:border-white/10">
        <h3 className="text-lg font-semibold text-[#405a60] dark:text-[#dce8e6]">
          {t("timeOffTitle")}
        </h3>
        <form
          onSubmit={(event) => void addTimeOff(event)}
          className="mt-4 grid gap-3 sm:grid-cols-2"
        >
          {isAdmin && members.length > 1 && (
            <label className="sm:col-span-2">
              <span className="mb-2 block text-sm font-semibold">
                {t("member")}
              </span>
              <select
                value={
                  timeOffTarget === "current"
                    ? (selectedMember?.id ?? "")
                    : timeOffTarget
                }
                onChange={(event) => setTimeOffTarget(event.target.value)}
                className="min-h-12 w-full rounded-xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
              >
                <option value="all">{t("allMembers")}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="mb-2 block text-sm font-semibold">
              {t("startDate")}
            </span>
            <input
              type="date"
              required
              value={startDate}
            onChange={(event) => {
              setStartDate(event.target.value)
              setEndDate((current) => current < event.target.value ? event.target.value : current)
            }}
              className="min-h-12 w-full rounded-xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold">
              {t("startTime")}
            </span>
            <input
              type="time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold">
              {t("endDate")}
            </span>
            <input
              type="date"
              required
              min={startDate}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
            />
          </label>
          <label>
            <span className="mb-2 block text-sm font-semibold">
              {t("endTime")}
            </span>
            <input
              type="time"
              required
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-[#dce6e3] bg-white px-3 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-2 block text-sm font-semibold">
              {t("reason")}
            </span>
            <input
              maxLength={160}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("reasonPlaceholder")}
              className="min-h-12 w-full rounded-xl border border-[#dce6e3] bg-white px-4 text-base dark:border-white/10 dark:bg-[#20373e] dark:text-white"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !selectedMember}
            className="min-h-12 rounded-full bg-[#416e7e] px-6 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
          >
            {t("addTimeOff")}
          </button>
        </form>
        <div className="mt-5 space-y-2">
          {visibleTimeOff.length === 0 ? (
            <p className="rounded-xl bg-[#f6f9f7] p-4 text-sm text-[#829193] dark:bg-white/5">
              {t("noTimeOff")}
            </p>
          ) : (
            visibleTimeOff.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-[#edf1ef] p-3 dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="font-medium text-[#496267] dark:text-[#d0dedd]">
                    {formatTimeOff(item)}
                  </p>
                  <p className="mt-1 truncate text-sm text-[#829193]">
                    {memberName(item.member_id)}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void deleteTimeOff(item.id)}
                  className="min-h-10 shrink-0 rounded-full border border-[#efd9d4] px-4 text-sm font-semibold text-[#a65b52] disabled:opacity-50 dark:border-white/10 dark:text-[#efb0a5]"
                >
                  {t("removeTimeOff")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {feedback && (
        <p
          role="status"
          className="rounded-xl bg-[#eff6f2] p-3 text-sm font-medium text-[#4d7d6a] dark:bg-white/5 dark:text-[#c6dfd0]"
        >
          {feedback}
        </p>
      )}
    </section>
  )
}
