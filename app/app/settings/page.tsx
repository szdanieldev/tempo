import { getTranslations } from "next-intl/server"
import { SettingsView } from "@/components/settings-view"
import { getOwnerContext } from "@/lib/server/auth"
import { createTenantSupabaseClient } from "@/lib/server/supabase"

export default async function SettingsPage() {
  const owner = await getOwnerContext()
  const common = await getTranslations("Common")
  const client = await createTenantSupabaseClient()
  let name = common("businessDemo")
  let slug = "editfodraszat"
  let stripeConnectEnabled = false
  let onlinePayment = false
  let subscriptionStatus = "pending"
  let hasBillingCustomer = false
  let defaultLocale: "hu" | "en" = "hu"
  let timezone = "Europe/Budapest"
  let opensAt = "09:00"
  let closesAt = "17:00"
  let minimumNoticeMinutes = 120
  let maxDaysAhead = 60
  let cancellationWindowHours = 24
  let bufferMinutes = 0
  let autoConfirm = true
  let emailReminder = true
  let bookingDescription = ""
  let bookingColor = "#416e7e"
  let bookingLogoUrl = ""
  if (client && owner.orgId && !owner.isDemo) {
    const { data } = await client
      .from("organizations")
      .select(
        "name,slug,settings,default_locale,timezone,stripe_connect_enabled,stripe_customer_id,subscription_status"
      )
      .eq("id", owner.orgId)
      .maybeSingle()
    if (data) {
      name = data.name
      slug = data.slug
      stripeConnectEnabled = data.stripe_connect_enabled
      onlinePayment = Boolean(
        (data.settings as { payments?: { stripe_online?: boolean } } | null)
          ?.payments?.stripe_online
      )
      subscriptionStatus = data.subscription_status
      hasBillingCustomer = Boolean(data.stripe_customer_id)
      defaultLocale = data.default_locale === "en" ? "en" : "hu"
      timezone = data.timezone
      const settings = data.settings as {
        booking?: {
          minimum_notice_minutes?: number
          max_days_ahead?: number
          buffer_minutes?: number
          cancellation_window_hours?: number
          auto_confirm?: boolean
        }
        notifications?: { email_reminder?: boolean }
      } | null
      const appearance = (
        data.settings as {
          booking_page?: {
            description?: string
            color?: string
            logo_url?: string | null
          }
        } | null
      )?.booking_page
      bookingDescription = appearance?.description ?? ""
      bookingColor = appearance?.color ?? bookingColor
      bookingLogoUrl = appearance?.logo_url ?? ""
      minimumNoticeMinutes =
        settings?.booking?.minimum_notice_minutes ?? minimumNoticeMinutes
      maxDaysAhead = settings?.booking?.max_days_ahead ?? maxDaysAhead
      cancellationWindowHours =
        settings?.booking?.cancellation_window_hours ?? cancellationWindowHours
      bufferMinutes = settings?.booking?.buffer_minutes ?? bufferMinutes
      autoConfirm = settings?.booking?.auto_confirm ?? autoConfirm
      emailReminder = settings?.notifications?.email_reminder ?? emailReminder
      const { data: member } = await client
        .from("members")
        .select("id")
        .eq("org_id", owner.orgId)
        .eq("clerk_user_id", owner.userId!)
        .maybeSingle()
      if (member) {
        const { data: hours } = await client
          .from("working_hours")
          .select("opens_at,closes_at,is_closed")
          .eq("org_id", owner.orgId)
          .eq("member_id", member.id)
          .eq("weekday", 1)
          .maybeSingle()
        if (hours && !hours.is_closed) {
          opensAt = hours.opens_at.slice(0, 5)
          closesAt = hours.closes_at.slice(0, 5)
        }
      }
    }
  }
  return (
    <SettingsView
      initialName={name}
      initialSlug={slug}
      rootDomain={process.env.ROOT_DOMAIN ?? ""}
      stripeConnectEnabled={stripeConnectEnabled}
      initialOnlinePayment={onlinePayment}
      subscriptionStatus={subscriptionStatus}
      hasBillingCustomer={hasBillingCustomer}
      billingAvailable={Boolean(
        process.env.STRIPE_ORG_PRICE_ID && process.env.STRIPE_SECRET_KEY
      )}
      defaultLocale={defaultLocale}
      timezone={timezone}
      initialHours={{ opensAt, closesAt }}
      initialBookingRules={{
        minimumNoticeMinutes,
        maxDaysAhead,
        bufferMinutes,
        cancellationWindowHours,
        autoConfirm,
        emailReminder,
      }}
      initialBookingAppearance={{
        description: bookingDescription,
        color: bookingColor,
        logoUrl: bookingLogoUrl,
      }}
      isAdmin={
        owner.isDemo || owner.role === "org:admin" || owner.role === "org:owner"
      }
    />
  )
}
