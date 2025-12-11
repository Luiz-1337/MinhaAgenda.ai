import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserSalons } from "@/app/actions/salon"
import { SalonProvider } from "@/contexts/salon-context"
import { SidebarNav, MobileSidebar } from "@/components/dashboard/sidebar"
import { UserNav } from "@/components/dashboard/user-nav"
import { SalonSelector } from "@/components/dashboard/salon-selector"

export default async function SalonLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Busca os salões do usuário
  const salons = await getUserSalons()
  
  if (salons.length === 0) {
    redirect("/onboarding")
  }

  // Verifica se o salonId é válido
  const salonExists = salons.some((s) => s.id === salonId)
  if (!salonExists && salons.length > 0) {
    // Redireciona para o primeiro salão se o ID não for válido
    redirect(`/${salons[0].id}/dashboard`)
  }

  return (
    <SalonProvider initialSalons={salons}>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:border-r md:bg-background">
          <div className="flex flex-col h-full">
            <div className="flex h-16 items-center border-b px-6">
              <h1 className="text-lg font-semibold">MinhaAgenda AI</h1>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <SidebarNav />
            </div>
          </div>
        </aside>

        {/* Conteúdo Principal */}
        <div className="flex flex-1 flex-col md:pl-64">
          {/* Header */}
          <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
            <MobileSidebar />
            <div className="flex flex-1 items-center gap-4">
              <SalonSelector />
            </div>
            <UserNav />
          </header>

          {/* Conteúdo da Página */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SalonProvider>
  )
}

