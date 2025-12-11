import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import { eq } from "drizzle-orm"
import { getDashboardStats, initializeDashboardData } from "@/app/actions/dashboard"
import DashboardContent from "./DashboardContent"

export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams: { salonId?: string }
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Busca o salão ativo (da URL ou o primeiro do usuário)
  let salonId = searchParams.salonId

  if (!salonId) {
    const firstSalon = await db.query.salons.findFirst({
      where: eq(salons.ownerId, user.id),
      columns: { id: true },
    })
    if (firstSalon) {
      salonId = firstSalon.id
    }
  }

  if (!salonId) {
    redirect("/onboarding")
  }

  // Verifica acesso e busca dados em paralelo
  const [salon, statsResult] = await Promise.all([
    db.query.salons.findFirst({
      where: eq(salons.id, salonId),
      columns: { ownerId: true },
    }),
    getDashboardStats(salonId),
  ])

  if (!salon || salon.ownerId !== user.id) {
    redirect("/dashboard")
  }

  // Inicializa dados em background (não bloqueia renderização)
  initializeDashboardData(salonId).catch(console.error)
  
  if ("error" in statsResult) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-destructive">Erro ao carregar dados: {statsResult.error}</p>
      </div>
    )
  }

  return <DashboardContent stats={statsResult} />
}
