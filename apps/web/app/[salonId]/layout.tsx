import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getUserSalons } from "@/app/actions/salon"
import { SalonProvider } from "@/contexts/salon-context"
import { SidebarNav, MobileSidebar } from "@/components/dashboard/sidebar"
import { UserNav } from "@/components/dashboard/user-nav"
import { SalonSelector } from "@/components/dashboard/salon-selector"
import { Bot } from 'lucide-react'

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

  const activeSalon = salons.find(s => s.id === salonId) || salons[0]

  return (
    <SalonProvider initialSalons={salons}>
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
        <main className="flex-1 flex flex-col h-full relative overflow-hidden md:ml-0">
          {/* Ambient Background Effects */}
          <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-indigo-100/50 dark:from-indigo-900/10 to-transparent pointer-events-none z-0"></div>
          <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-indigo-500/5 dark:bg-indigo-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>
          
          {/* Header */}
          <header className="h-16 flex items-center justify-between px-4 md:px-8 border-b border-slate-200 dark:border-white/5 relative z-10 backdrop-blur-sm transition-colors duration-300">
            <div className="flex items-center gap-4">
              <MobileSidebar />
              <SalonSelector />
              <div className="hidden md:block h-4 w-px bg-slate-300 dark:bg-white/10"></div>
              <div className="hidden md:flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-500 uppercase tracking-widest font-bold">Realtime</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <UserNav />
            </div>
          </header>

          {/* Conteúdo da Página */}
          <div className="flex-1 overflow-y-auto relative z-10">
            {children}
          </div>

          {/* Footer Status Bar */}
          <div className="h-8 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-white/5 flex items-center justify-between px-6 text-[10px] text-slate-500 dark:text-slate-400 select-none z-20 transition-colors duration-300">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
              <span>Infraestrutura saudável</span>
              <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>
              <span>Última sincronização: há alguns segundos</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono">v4.2.0-stable</span>
            </div>
          </div>
        </main>
      </div>
    </SalonProvider>
  )
}

