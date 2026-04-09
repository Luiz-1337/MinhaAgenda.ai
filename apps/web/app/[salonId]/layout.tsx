import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserSalons } from "@/app/actions/salon"
import { SalonProvider } from "@/contexts/salon-context"
import { SidebarNav, MobileSidebar } from "@/components/dashboard/sidebar"
import { UserNav } from "@/components/dashboard/user-nav"
import { SalonSelector } from "@/components/dashboard/salon-selector"
import { RouteGuard } from "@/components/auth/route-guard"
import { Bot } from 'lucide-react'

export default async function SalonLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ salonId: string }>
}) {
  const { salonId } = await params

  // Paraleliza auth + busca de salões (antes era sequencial)
  const [supabaseClient, salons] = await Promise.all([
    createClient(),
    getUserSalons(),
  ])

  const {
    data: { user },
  } = await supabaseClient.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  if (salons.length === 0) {
    redirect("/onboarding")
  }

  // Verifica se o salonId é válido
  const salonExists = salons.some((s) => s.id === salonId)
  if (!salonExists && salons.length > 0) {
    redirect(`/${salons[0].id}/dashboard`)
  }

  // Extrai nome do usuário no server para evitar fetch redundante no client
  const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || ""

  return (
    <SalonProvider initialSalons={salons}>
      <RouteGuard />
      <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20 transition-colors duration-300">
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex md:w-[220px] h-full bg-sidebar border-r border-sidebar-border flex-col relative z-10 transition-colors">
          <div className="flex flex-col h-full">
            {/* Brand */}
            <div className="h-11 flex items-center px-5 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-brand-blue flex items-center justify-center">
                  <Bot className="text-accent-foreground" size={18} />
                </div>
                <span className="font-bold text-base text-sidebar-foreground tracking-tight">
                  minha<span className="text-brand-blue">agenda</span>.ai
                </span>
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <SidebarNav />
            </div>
          </div>
        </aside>

        {/* Conteudo Principal */}
        <main className="flex-1 flex flex-col h-screen relative overflow-hidden md:ml-0">
          {/* Header */}
          <header className="h-11 flex-shrink-0 flex items-center justify-between px-4 md:px-8 bg-sidebar text-sidebar-foreground border-b border-sidebar-border relative z-10 transition-colors duration-150">
            <div className="flex items-center gap-4">
              <MobileSidebar />
              <SalonSelector />
            </div>

            <div className="flex items-center gap-4">
              <UserNav userName={userName} />
            </div>
          </header>

          {/* Conteudo da Pagina */}
          <div className="flex-1 overflow-hidden p-3 sm:p-4 md:p-5 lg:p-[25px] min-h-0">
            <div className="h-full overflow-y-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SalonProvider>
  )
}
