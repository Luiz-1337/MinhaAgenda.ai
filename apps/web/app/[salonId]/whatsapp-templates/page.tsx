import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { WhatsAppTemplatesClient } from "./whatsapp-templates-client"

interface PageProps {
  params: Promise<{ salonId: string }>
}

export default async function WhatsAppTemplatesPage({ params }: PageProps) {
  const { salonId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  return <WhatsAppTemplatesClient salonId={salonId} />
}
