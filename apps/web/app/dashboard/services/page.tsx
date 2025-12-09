import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"
import { db, salons } from "@repo/db"
import ServiceList from "./ServiceList"

export default async function ServicesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  const salon = await db.query.salons.findFirst({
    where: eq(salons.ownerId, user.id),
    columns: { id: true },
  })

  if (!salon) {
    return <div className="text-sm text-muted-foreground">Salão não encontrado.</div>
  }

  return <ServiceList salonId={salon.id} />
}
