import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Se não estiver autenticado, redireciona para login
  if (!session) {
    redirect("/login")
  }

  // Permite acesso ao onboarding mesmo se já tiver salões
  // Isso permite criar múltiplos salões
  return <>{children}</>
}

