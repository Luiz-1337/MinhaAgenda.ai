import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { AdminSidebar, AdminMobileSidebar } from "@/components/admin/admin-sidebar"
import { ThemeToggle } from "@/components/theme-toggle"

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

    return (
        <div className="flex h-screen w-screen bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-200 overflow-hidden font-sans selection:bg-indigo-500/30 transition-colors duration-300">
            {/* Sidebar Desktop */}
            <AdminSidebar />

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen relative overflow-hidden md:ml-0">
                {/* Ambient Background Effects */}
                <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-red-100/50 dark:from-red-900/10 to-transparent pointer-events-none z-0"></div>
                <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-red-500/5 dark:bg-red-600/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

                {/* Header */}
                <header className="h-16 flex-shrink-0 flex items-center justify-between px-4 md:px-8 border-b border-slate-200 dark:border-white/5 relative z-10 backdrop-blur-sm transition-colors duration-300">
                    <div className="flex items-center gap-4">
                        <AdminMobileSidebar />
                        <h1 className="text-lg font-semibold text-slate-800 dark:text-white">Painel Administrativo</h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                            {profile?.full_name || user.email}
                        </span>
                        <ThemeToggle />
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 overflow-hidden relative z-10 p-3 sm:p-4 md:p-5 lg:p-[25px] min-h-0">
                    <div className="h-full overflow-y-auto">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}
