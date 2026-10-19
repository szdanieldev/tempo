import "server-only"
import { Resend } from "resend"
import { brand } from "@/config/brand"
import hu from "../../../messages/hu.json"
import en from "../../../messages/en.json"
import { createServiceSupabaseClient } from "@/lib/server/supabase"

export type NotificationType = "confirmation" | "pending_approval" | "payment_required" | "owner_new_booking" | "reminder" | "cancellation"
export type NotificationProvider = {
  sendEmail(input: { to: string; subject: string; html: string }): Promise<{ id: string | null }>
  sendSms?(input: { to: string; body: string }): Promise<{ id: string | null }>
}

class ResendNotificationProvider implements NotificationProvider {
  private client = new Resend(process.env.RESEND_API_KEY)

  async sendEmail(input: { to: string; subject: string; html: string }) {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return { id: null }
    const result = await this.client.emails.send({ from: process.env.EMAIL_FROM, to: input.to, subject: input.subject, html: input.html })
    if (result.error) throw new Error(result.error.message)
    return { id: result.data?.id ?? null }
  }
}

type EmailInput = {
  orgId: string
  appointmentId: string
  type: NotificationType
  to: string
  locale: "hu" | "en"
  name: string
  serviceName: string
  startsAt: string
  timezone: string
  priceHuf: number
  manageUrl?: string
  checkoutUrl?: string
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character)
}

function localize(input: EmailInput) {
  const dictionary = input.locale === "hu" ? hu : en
  const email = dictionary.Email
  const date = new Intl.DateTimeFormat(input.locale === "hu" ? "hu-HU" : "en-GB", { timeZone: input.timezone, dateStyle: "full" }).format(new Date(input.startsAt))
  const time = new Intl.DateTimeFormat(input.locale === "hu" ? "hu-HU" : "en-GB", { timeZone: input.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(input.startsAt))
  const subject = input.type === "owner_new_booking" ? email.ownerSubject : input.type === "reminder" ? email.reminderSubject : input.type === "cancellation" ? email.cancelSubject : input.type === "pending_approval" ? email.pendingSubject : input.type === "payment_required" ? email.paymentRequiredSubject : email.confirmationSubject
  const title = input.type === "owner_new_booking" ? email.ownerTitle : input.type === "cancellation" ? email.cancelTitle : input.type === "pending_approval" ? email.pendingTitle : input.type === "payment_required" ? email.paymentRequiredTitle : email.confirmationTitle
  const body = input.type === "reminder" ? email.reminderBody : input.type === "cancellation" ? email.cancellationBody : input.type === "owner_new_booking" ? email.ownerGreeting : input.type === "pending_approval" ? email.pendingBody : input.type === "payment_required" ? email.paymentRequiredBody : email.confirmationBody
  const greeting = input.type === "owner_new_booking" ? "" : email.confirmationGreeting.replace("{name}", escapeHtml(input.name))
  const rows = [
    [email.serviceLabel, input.serviceName],
    [email.dateLabel, date],
    [email.timeLabel, time],
    [email.priceLabel, new Intl.NumberFormat(input.locale === "hu" ? "hu-HU" : "en-GB", { style: "currency", currency: "HUF", maximumFractionDigits: 0 }).format(input.priceHuf)],
  ]
  return { email, emailBrandByline: dictionary.Brand.byline, subject, title, body, greeting, rows }
}

export async function deliverAppointmentEmail(input: EmailInput) {
  const service = createServiceSupabaseClient()
  let logId: string | null = null
  if (service) {
    const { data: existing } = await service.from("notification_log").select("id,status,sending_started_at").eq("appointment_id", input.appointmentId).eq("notification_type", input.type).eq("recipient", input.to).maybeSingle()
    if (existing?.status === "sent") return { sent: true, duplicate: true }
    if (existing?.id) {
      let claim = service.from("notification_log").update({ status: "sending", sending_started_at: new Date().toISOString() }).eq("id", existing.id)
      if (existing.status === "sending") {
        const staleBefore = Date.now() - 5 * 60_000
        if (existing.sending_started_at && new Date(existing.sending_started_at).getTime() > staleBefore) return { sent: false, duplicate: true }
        claim = claim.eq("status", "sending")
        claim = existing.sending_started_at ? claim.eq("sending_started_at", existing.sending_started_at) : claim.is("sending_started_at", null)
      } else {
        claim = claim.in("status", ["queued", "failed"])
      }
      const { data } = await claim.select("id").maybeSingle()
      if (!data) return { sent: false, duplicate: true }
      logId = data.id
    } else {
      const { data, error } = await service.from("notification_log").insert({ org_id: input.orgId, appointment_id: input.appointmentId, notification_type: input.type, recipient: input.to, status: "sending", sending_started_at: new Date().toISOString() }).select("id").single()
      if (error?.code === "23505") return { sent: false, duplicate: true }
      if (error) return { sent: false, error: "notification_log_failed" }
      logId = data?.id ?? null
    }
  }

  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    if (service && logId) await service.from("notification_log").update({ status: "queued", sending_started_at: null }).eq("id", logId)
    return { sent: false, queued: true }
  }
  const localized = localize(input)
  const rows = localized.rows.map(([label, value]) => `<tr><td style="padding:8px 12px;color:#728488">${escapeHtml(label)}</td><td style="padding:8px 12px;font-weight:600;color:#29454d">${escapeHtml(value)}</td></tr>`).join("")
  const paymentAction = input.checkoutUrl ? `<a href="${escapeHtml(input.checkoutUrl)}" style="display:inline-block;margin-top:22px;padding:13px 22px;border-radius:999px;background:#416e7e;color:#fff;text-decoration:none;font-weight:600">${escapeHtml(localized.email.payNow)}</a>` : ""
  const manageAction = input.manageUrl ? `<a href="${escapeHtml(input.manageUrl)}" style="display:inline-block;margin:22px 0 0 8px;padding:13px 22px;border-radius:999px;border:1px solid #dce6e3;color:#416e7e;text-decoration:none;font-weight:600">${escapeHtml(localized.email.manageAppointment)}</a>` : ""
  const html = `<div style="background:#f3f7f5;padding:32px 16px;font-family:Arial,sans-serif;color:#29454d"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3ebe8;border-radius:24px;padding:30px"><p style="margin:0 0 18px;color:#5f888e;font-weight:700">${brand.name} · ${escapeHtml(localized.emailBrandByline)}</p><h1 style="margin:0 0 16px;font-size:24px">${escapeHtml(localized.title)}</h1>${localized.greeting ? `<p style="line-height:1.6">${escapeHtml(localized.greeting)}</p>` : ""}<p style="line-height:1.6">${escapeHtml(localized.body)}</p><table style="width:100%;border-collapse:collapse;border-radius:14px;background:#f6f9f7">${rows}</table>${paymentAction}${manageAction}<p style="margin:25px 0 0;color:#899697;font-size:12px">${escapeHtml(localized.email.footer)}</p></div></div>`
  const provider = new ResendNotificationProvider()
  try {
    const result = await provider.sendEmail({ to: input.to, subject: localized.subject, html })
    if (service && logId) await service.from("notification_log").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.id, sending_started_at: null }).eq("id", logId)
    return { sent: true, id: result.id }
  } catch (error) {
    if (service && logId) await service.from("notification_log").update({ status: "failed", sending_started_at: null }).eq("id", logId)
    return { sent: false, error: error instanceof Error ? error.message : "email_failed" }
  }
}
