import { ClerkSetupWizard, DemoSetupWizard } from "@/components/setup-wizard"

export default function SetupPage() {
  const configured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY)
  return configured ? <ClerkSetupWizard /> : <DemoSetupWizard />
}
