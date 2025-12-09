import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MobileSidebar, SidebarNav } from "@/components/dashboard/sidebar"
import { UserNav } from "@/components/dashboard/user-nav"

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect("/login")
  }

  return (
    <div className="min-h-screen bg-transparent md:pl-72">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/5 bg-slate-900/70 backdrop-blur-xl md:flex">
        <div className="flex h-full w-full flex-col p-4">
          <div className="mb-6 rounded-xl border border-white/5 bg-gradient-to-br from-cyan-500/20 via-indigo-500/15 to-fuchsia-500/20 px-4 py-3 text-lg font-semibold text-white shadow-lg shadow-cyan-500/10">
            MinhaAgenda AI
            <div className="text-xs font-normal text-slate-200/70">Pilotando a operação com IA</div>
          </div>
          <SidebarNav />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-white/5 bg-slate-900/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <MobileSidebar />
            </div>
            <span className="text-sm font-medium text-slate-200">Dashboard</span>
          </div>
          <UserNav />
        </div>
      </header>

      <main className="px-4 py-8 md:px-8">{children}</main>
    </div>
  )
}

