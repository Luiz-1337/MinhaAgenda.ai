"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CheckCircle2, Ticket, XCircle, Clock } from "lucide-react"

interface Payment {
    id: string
    amount: string
    status: "PENDING" | "APPROVED" | "FAILED" | "REFUNDED"
    method: "PIX" | "CARD" | "BOLETO"
    createdAt: Date
}

interface PaymentHistoryProps {
    payments: Payment[]
}

const statusMap = {
    PENDING: { label: "Pendente", icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    APPROVED: { label: "Aprovado", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
    FAILED: { label: "Falhou", icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
    REFUNDED: { label: "Estornado", icon: Ticket, color: "text-slate-500", bg: "bg-slate-500/10" },
}

export function PaymentHistory({ payments }: PaymentHistoryProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg font-bold">Histórico de Pagamentos</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {payments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
                    ) : (
                        payments.map((payment) => {
                            const status = statusMap[payment.status]
                            return (
                                <div key={payment.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${status.bg}`}>
                                            <status.icon className={`w-4 h-4 ${status.color}`} />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(payment.amount))}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {format(new Date(payment.createdAt), "dd 'de' MMM, HH:mm", { locale: ptBR })}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant={payment.status === 'APPROVED' ? 'default' : 'secondary'}>
                                        {status.label}
                                    </Badge>
                                </div>
                            )
                        })
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
