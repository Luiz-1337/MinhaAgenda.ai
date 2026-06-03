import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminSidebar, AdminMobileSidebar } from "@/components/admin/admin-sidebar"
import { AdminUserNav } from "@/components/admin/admin-user-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/z_admin_login")
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("system_role, full_name")
    .eq("id", user.id)
    .single()

  if (profile?.system_role !== "admin") {
    redirect("/z_admin_login")
  }

  const userName = profile?.full_name || user.email?.split("@")[0] || ""

  return (
    <div className="flex h-screen w-screen bg-background text-foreground overflow-hidden font-sans selection:bg-primary/20 transition-colors duration-300">
      {/* Sidebar Desktop */}
      <AdminSidebar />

      {/* Conteudo Principal */}
      <main className="flex-1 flex flex-col h-screen relative overflow-hidden md:ml-0">
        {/* Header */}
        <header className="h-11 flex-shrink-0 flex items-center justify-between px-4 md:px-8 bg-sidebar text-sidebar-foreground border-b border-sidebar-border relative z-10 transition-colors duration-150">
          <div className="flex items-center gap-4">
            <AdminMobileSidebar />
            <span className="text-sm font-light text-sidebar-foreground/90">Painel Administrativo</span>
          </div>

          <div className="flex items-center gap-4">
            <AdminUserNav userName={userName} />
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
  )
}
