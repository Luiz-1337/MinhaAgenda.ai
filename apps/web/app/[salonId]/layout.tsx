import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserSalons } from "@/app/actions/salon"
import { SalonProvider } from "@/contexts/salon-context"
import { SidebarNav, MobileSidebar } from "@/components/dashboard/sidebar"
import { UserNav } from "@/components/dashboard/user-nav"
import { SalonSelector } from "@/components/dashboard/salon-selector"
import { RouteGuard } from "@/components/auth/route-guard"
import { Bot } from 'lucide-react'
import { db, profiles } from "@repo/db"
import { eq } from "drizzle-orm"

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
    // Verifica se o usuário tem plano SOLO antes de redirecionar
    const userProfile = await db.query.profiles.findFirst({
      where: eq(profiles.id, user.id),
      columns: { tier: true },
    })

    // Se for SOLO e não tiver salão, permite criar o primeiro (via onboarding)
    // Se não for SOLO, redireciona para onboarding normalmente
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
      <RouteGuard />
      <div className="flex h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-200 overflow-hidden font-sans selection:bg-indigo-500/30 transition-colors duration-300">
        {/* Sidebar Desktop */}
        <aside className="hidden md:flex md:w-64 h-full bg-slate-50/80 dark:bg-slate-950/50 border-r border-slate-200 dark:border-white/5 flex flex-col backdrop-blur-md relative z-20 transition-colors duration-300">
          <div className="flex flex-col h-full">
            {/* Brand */}
            <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                  <Bot className="text-white" size={20} />
                </div>
                <span className="font-bold text-lg text-slate-800 dark:text-white tracking-tight">
                  minha<span className="text-indigo-600 dark:text-indigo-400">agenda</span>.ai
                </span>
              </div>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <SidebarNav />
            </div>
          </div>
        </aside>

        {/* Conteúdo Principal */}
        <main className="flex-1 flex flex-col h-screen relative overflow-hidden md:ml-0">
          {/* Ambient Background Effects */}
          <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-indigo-100/50 dark:from-indigo-900/10 to-transparent pointer-events-none z-0"></div>
          <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/5 dark:bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>
          
          {/* Header */}
          <header className="h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-8 border-b border-slate-200 dark:border-white/5 relative z-10 backdrop-blur-sm transition-colors duration-300">
            <div className="flex items-center gap-4">
              <MobileSidebar />
              <SalonSelector />
            </div>

            <div className="flex items-center gap-4">
              <UserNav />
            </div>
          </header>

          {/* Conteúdo da Página */}
          <div className="flex-1 overflow-hidden relative z-10 pt-[25px] pr-[25px] pl-[25px] pb-[25px] min-h-0">
            <div className="h-full overflow-y-auto">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SalonProvider>
  )
}
