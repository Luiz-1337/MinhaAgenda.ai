import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import ServiceList from "./ServiceList"

export default async function ServicesPage({
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
    return <div className="text-sm text-muted-foreground">Salão não encontrado.</div>
  }

  // Verifica acesso ao salão (pode ser otimizado se não precisar buscar novamente)
  const salon = await db.query.salons.findFirst({
    where: eq(salons.id, salonId),
    columns: { ownerId: true },
  })

  if (!salon || salon.ownerId !== user.id) {
    redirect("/dashboard/services")
  }

  return <ServiceList salonId={salonId} />
}
