import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MobileSidebar, SidebarNav } from "@/components/dashboard/sidebar"
import { UserNav } from "@/components/dashboard/user-nav"
import { SalonSelector } from "@/components/dashboard/salon-selector"
import { SalonProvider } from "@/contexts/salon-context"
import { getUserSalons } from "@/app/actions/salon"

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  // Paraleliza verificação de sessão e busca de salões
  const [
    { data: { session } },
    userSalons,
  ] = await Promise.all([
    supabase.auth.getSession(),
    getUserSalons(),
  ])

  if (!session) {
    redirect("/login")
  }

  // Se o usuário não tem salões, redireciona para onboarding
  if (userSalons.length === 0) {
    redirect("/onboarding")
  }

  return (
    <SalonProvider initialSalons={userSalons}>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar Desktop */}
        <aside className="hidden w-64 border-r bg-sidebar md:flex md:flex-col">
          <div className="flex h-full flex-col">
            <div className="border-b p-6">
              <h1 className="text-lg font-semibold">MinhaAgenda AI</h1>
              <p className="text-sm text-muted-foreground">Pilotando a operação com IA</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
              <SidebarNav />
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <header className="glass sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="flex h-16 items-center justify-between px-4 md:px-6">
              <div className="flex items-center gap-4">
                <div className="md:hidden">
                  <MobileSidebar />
                </div>
                <span className="text-lg font-semibold">Dashboard</span>
              </div>
              <div className="flex items-center gap-4">
                <SalonSelector />
                <UserNav />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <div className="container mx-auto p-4 md:p-6">{children}</div>
          </main>
        </div>
      </div>
    </SalonProvider>
  )
}

