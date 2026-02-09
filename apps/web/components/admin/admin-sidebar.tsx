"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
    Sheet,
    SheetContent,
    SheetTrigger,
} from "@/components/ui/sheet"
import {
    LayoutDashboard,
    Users,
    CreditCard,
    Coins,
    LogOut,
    Menu,
    Shield,
} from "lucide-react"
import { createBrowserClient } from "@supabase/ssr"
import { toast } from "sonner"

const menuGroups = [
    {
        title: 'Visão Geral',
        items: [
            { href: "/z_admin_minhaagendaai", label: "Dashboard", icon: LayoutDashboard },
        ]
    },
    {
        title: 'Gestão',
        items: [
            { href: "/z_admin_minhaagendaai/users", label: "Usuários", icon: Users },
            { href: "/z_admin_minhaagendaai/plans", label: "Planos", icon: CreditCard },
            { href: "/z_admin_minhaagendaai/tokens", label: "Tokens", icon: Coins },
        ]
    },
] as const

export function AdminSidebarNav() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut()
        if (error) {
            toast.error("Erro ao sair")
            return
        }
        router.push("/z_admin_login")
    }

    const isActive = (href: string) => {
        if (href === "/z_admin_minhaagendaai") {
            return pathname === href
        }
        return pathname?.startsWith(href)
    }

    return (
        <>
            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                {menuGroups.map((group, groupIndex) => (
                    <div key={groupIndex} className="mb-6">
                        <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-2 px-3">
                            {group.title}
                        </h4>
                        <div className="space-y-0.5">
                            {group.items.map((item) => {
                                const active = isActive(item.href)
                                const Icon = item.icon
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={cn(
                                            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200",
                                            active
                                                ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20 shadow-sm dark:shadow-[0_0_15px_rgba(99,102,241,0.1)]"
                                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200"
                                        )}
                                    >
                                        <Icon size={18} />
                                        <span>{item.label}</span>
                                    </Link>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Logout Button */}
            <div className="p-4 border-t border-slate-200 dark:border-white/5">
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all duration-200"
                >
                    <LogOut size={18} />
                    <span>Sair</span>
                </button>
            </div>
        </>
    )
}

export function AdminSidebar() {
    return (
        <aside className="hidden md:flex md:w-64 h-full bg-slate-50/80 dark:bg-slate-950/50 border-r border-slate-200 dark:border-white/5 flex-col backdrop-blur-md relative z-20 transition-colors duration-300">
            <div className="flex flex-col h-full">
                {/* Brand */}
                <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-white/5">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                            <Shield className="text-white" size={20} />
                        </div>
                        <span className="font-bold text-lg text-slate-800 dark:text-white tracking-tight">
                            Admin<span className="text-red-600 dark:text-red-400">Panel</span>
                        </span>
                    </div>
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                    <AdminSidebarNav />
                </div>
            </div>
        </aside>
    )
}

export function AdminMobileSidebar() {
    return (
        <Sheet>
            <SheetTrigger asChild>
                <button
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-600 dark:text-slate-400 transition-colors md:hidden"
                    aria-label="Abrir menu"
                >
                    <Menu size={20} />
                </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-slate-50/80 dark:bg-slate-950/50 backdrop-blur-md border-slate-200 dark:border-white/5">
                <div className="flex flex-col h-full">
                    {/* Brand */}
                    <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-white/5">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center shadow-lg shadow-red-500/20">
                                <Shield className="text-white" size={20} />
                            </div>
                            <span className="font-bold text-lg text-slate-800 dark:text-white tracking-tight">
                                Admin<span className="text-red-600 dark:text-red-400">Panel</span>
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <AdminSidebarNav />
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    )
}
