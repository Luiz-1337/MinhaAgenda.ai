import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { db, salons, eq } from "@repo/db"

export default async function OnboardingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Se não estiver autenticado, redireciona para login
  if (!user) {
    redirect("/login")
  }

  // Se o usuário já tem salão, redireciona para o dashboard
  const existingSalon = await db.query.salons.findFirst({
    where: eq(salons.ownerId, user.id),
    columns: { id: true },
  })

  if (existingSalon) {
    redirect(`/${existingSalon.id}/dashboard`)
  }

  return <>{children}</>
}

