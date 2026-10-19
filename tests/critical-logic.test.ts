import assert from "node:assert/strict"
import test from "node:test"
import { formatInTimeZone } from "date-fns-tz"
import { calculateAvailableSlots } from "../src/lib/availability"
import { getTenantSlugFromHost, suggestSlug, validateSlug } from "../src/lib/slug"

function slots(date: string, hours: { opensAt: string; closesAt: string }, durationMinutes = 30) {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay()
  return calculateAvailableSlots({
    date,
    timezone: "Europe/Budapest",
    durationMinutes,
    slotIntervalMinutes: 30,
    now: new Date(`${date}T00:00:00.000Z`),
    workingHours: [{ weekday, ...hours }],
  })
}

test("slug suggestions transliterate Hungarian names and validation rejects reserved labels", () => {
  assert.equal(suggestSlug("Édit Fodrászat"), "edit-fodraszat")
  assert.deepEqual(validateSlug("edit-fodraszat"), { valid: true })
  assert.deepEqual(validateSlug("www"), { valid: false, reason: "reserved" })
  assert.equal(validateSlug("admin").reason, "reserved")
  assert.equal(validateSlug("édes").valid, false)
})

test("tenant host parsing supports production and wildcard localhost hosts", () => {
  assert.equal(getTenantSlugFromHost("edit-fodraszat.idopontfoglalo.hu", "idopontfoglalo.hu"), "edit-fodraszat")
  assert.equal(getTenantSlugFromHost("edit-fodraszat.localhost:3000", "localhost:3000"), "edit-fodraszat")
  assert.equal(getTenantSlugFromHost("edit-fodraszat.localhost:3000", "dev-tunnel.example"), "edit-fodraszat")
  assert.equal(getTenantSlugFromHost("edit-fodraszat.localhost", "dev-tunnel.example"), "edit-fodraszat")
  assert.equal(getTenantSlugFromHost("idopontfoglalo.hu", "idopontfoglalo.hu"), null)
  assert.equal(getTenantSlugFromHost("shop.other.idopontfoglalo.hu", "idopontfoglalo.hu"), null)
})

test("availability respects the configured gap around existing appointments", () => {
  const weekday = new Date("2026-10-20T00:00:00Z").getUTCDay()
  const result = calculateAvailableSlots({
    date: "2026-10-20",
    timezone: "Europe/Budapest",
    durationMinutes: 30,
    bufferMinutes: 15,
    slotIntervalMinutes: 15,
    now: new Date("2026-10-19T00:00:00Z"),
    workingHours: [{ weekday, opensAt: "09:00", closesAt: "11:00" }],
    appointments: [{ startsAt: "2026-10-20T07:00:00.000Z", endsAt: "2026-10-20T07:30:00.000Z" }],
  })
  const localStarts = result.map((slot) => formatInTimeZone(slot.startsAt, "Europe/Budapest", "HH:mm"))
  assert.ok(!localStarts.includes("09:00"))
  assert.ok(!localStarts.includes("09:30"))
  assert.ok(localStarts.includes("09:45"))
  assert.ok(localStarts.includes("10:00"))
})

test("availability skips nonexistent spring-forward times and emits one autumn repeated hour", () => {
  const spring = slots("2026-03-29", { opensAt: "01:00", closesAt: "04:00" })
  const springStarts = spring.map((slot) => formatInTimeZone(slot.startsAt, "Europe/Budapest", "HH:mm"))
  assert.ok(!springStarts.some((time) => time.startsWith("02:")))
  assert.ok(springStarts.includes("03:00"))

  const autumn = slots("2026-10-25", { opensAt: "01:00", closesAt: "04:00" })
  const autumnStarts = autumn.map((slot) => formatInTimeZone(slot.startsAt, "Europe/Budapest", "HH:mm"))
  assert.equal(autumnStarts.filter((time) => time === "02:00").length, 1)
})

test("availability enforces minimum notice and booking horizon", () => {
  const weekday = new Date("2026-10-20T00:00:00Z").getUTCDay()
  const input = {
    date: "2026-10-20",
    timezone: "Europe/Budapest",
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    now: new Date("2026-10-20T06:00:00Z"),
    workingHours: [{ weekday, opensAt: "09:00", closesAt: "12:00" }],
  }
  const noticed = calculateAvailableSlots({ ...input, minimumNoticeMinutes: 150 })
  assert.equal(formatInTimeZone(noticed[0]!.startsAt, "Europe/Budapest", "HH:mm"), "10:30")
  const tomorrow = { ...input, date: "2026-10-21", workingHours: [{ weekday: 3, opensAt: "09:00", closesAt: "12:00" }], maxDaysAhead: 0 }
  assert.deepEqual(calculateAvailableSlots(tomorrow), [])
})
