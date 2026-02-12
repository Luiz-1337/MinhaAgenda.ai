import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { db, salons, eq } from "@repo/db"

// Redireciona rotas antigas para a nova estrutura
export default async function DashboardRedirect() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Busca o primeiro salão do usuário
  const firstSalon = await db.query.salons.findFirst({
    where: eq(salons.ownerId, user.id),
    columns: { id: true },
  })

  if (firstSalon) {
    redirect(`/${firstSalon.id}/dashboard`)
  } else {
    redirect("/onboarding")
  }
}
