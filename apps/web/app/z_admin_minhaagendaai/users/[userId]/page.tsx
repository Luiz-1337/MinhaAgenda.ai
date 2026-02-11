import { getUserDetails } from "@/app/actions/admin/users"
import { UserEditForm } from "@/components/admin/users/user-edit-form"
import { AdminResetPasswordForm } from "@/components/admin/users/admin-reset-password-form"
import { UsageStats } from "@/components/admin/users/usage-stats"
import { PaymentHistory } from "@/components/admin/users/payment-history"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CreditLimitEditor } from "@/components/admin/users/credit-limit-editor"

export const dynamic = 'force-dynamic'

const PLAN_CREDITS = {
    SOLO: 1_000_000,
    PRO: 5_000_000,
    ENTERPRISE: 10_000_000,
} as const

export default async function UserDetailsPage({
    params,
}: {
    params: Promise<{ userId: string }>
}) {
    const { userId } = await params
    const { user, error } = await getUserDetails(userId)

    if (error || !user) {
        if (error === "Usuário não encontrado") return notFound()
        return <div>Erro: {error}</div>
    }

    const salon = user.ownedSalons?.[0]
    const settings = salon?.settings as { custom_monthly_limit?: number } | null
    const currentLimit = settings?.custom_monthly_limit
    const tier = user.tier as keyof typeof PLAN_CREDITS
    const defaultLimit = PLAN_CREDITS[tier] || PLAN_CREDITS.SOLO

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/z_admin_minhaagendaai/users">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <h1 className="text-3xl font-bold">Detalhes do Usuário</h1>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <UsageStats plan={user.tier} tokens={0} /> {/* Tokens logic later */}

                {salon && (
                    <CreditLimitEditor
                        salonId={salon.id}
                        currentLimit={currentLimit}
                        defaultLimit={defaultLimit}
                    />
                )}
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-6">
                    <UserEditForm user={user} />
                    <AdminResetPasswordForm userId={user.id} />
                </div>
                <div className="space-y-6">
                    <PaymentHistory payments={user.payments as any[] || []} />
                </div>
            </div>
        </div>
    )
}
