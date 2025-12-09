import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { MobileSidebar, SidebarNav } from "@/components/dashboard/sidebar"
import { ThemeToggle } from "@/components/theme-toggle"
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
    <div className="min-h-screen bg-background text-foreground md:pl-72">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-sidebar-border/80 bg-sidebar/90 text-sidebar-foreground backdrop-blur-xl md:flex">
        <div className="flex h-full w-full flex-col p-4">
          <div className="mb-6 rounded-xl border border-sidebar-border bg-gradient-to-br from-primary/15 via-secondary/12 to-primary/10 px-4 py-3 text-lg font-semibold shadow-lg shadow-primary/10">
            MinhaAgenda AI
            <div className="text-xs font-normal text-muted-foreground">Pilotando a operação com IA</div>
          </div>
          <SidebarNav />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="md:hidden">
              <MobileSidebar />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Dashboard</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserNav />
          </div>
        </div>
      </header>

      <main className="px-4 py-8 md:px-8">{children}</main>
    </div>
  )
}

