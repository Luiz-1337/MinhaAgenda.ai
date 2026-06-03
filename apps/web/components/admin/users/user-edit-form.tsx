"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { updateUserDetails } from "@/app/actions/admin/users"
import { Loader2, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

const updateUserSchema = z.object({
    id: z.string().uuid(),
    fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email("Email inválido"),
    role: z.enum(["admin", "user"]),
    plan: z.enum(["SOLO", "PRO", "ENTERPRISE"]),
    documentType: z.string().optional(),
    documentNumber: z.string().optional(),
    billingAddress: z.string().optional(),
    billingPostalCode: z.string().optional(),
    billingCity: z.string().optional(),
    billingState: z.string().optional(),
    billingCountry: z.string().optional(),
    billingAddressComplement: z.string().optional(),
})

type UpdateUserFormValues = z.infer<typeof updateUserSchema>

interface UserEditFormProps {
    user: {
        id: string
        fullName: string | null
        firstName: string | null
        lastName: string | null
        email: string
        phone: string | null
        systemRole: "admin" | "user"
        tier: "SOLO" | "PRO" | "ENTERPRISE"
        documentType: string | null
        documentNumber: string | null
        billingAddress: string | null
        billingPostalCode: string | null
        billingCity: string | null
        billingState: string | null
        billingCountry: string | null
        billingAddressComplement: string | null
    }
}

const DOC_NONE = "none"

export function UserEditForm({ user }: UserEditFormProps) {
    const [isLoading, setIsLoading] = useState(false)
    const [docType, setDocType] = useState<string>(user.documentType || DOC_NONE)
    const router = useRouter()

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<UpdateUserFormValues>({
        resolver: zodResolver(updateUserSchema),
        defaultValues: {
            id: user.id,
            fullName: user.fullName || "",
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            phone: user.phone || "",
            email: user.email,
            role: user.systemRole,
            plan: user.tier,
            documentType: user.documentType || "",
            documentNumber: user.documentNumber || "",
            billingAddress: user.billingAddress || "",
            billingPostalCode: user.billingPostalCode || "",
            billingCity: user.billingCity || "",
            billingState: user.billingState || "",
            billingCountry: user.billingCountry || "BR",
            billingAddressComplement: user.billingAddressComplement || "",
        },
    })

    const onSubmit = async (data: UpdateUserFormValues) => {
        setIsLoading(true)
        try {
            const result = await updateUserDetails(data)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Usuário atualizado com sucesso!")
                router.refresh()
            }
        } catch (error) {
            toast.error("Erro ao atualizar usuário")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Informações do Usuário</CardTitle>
                <CardDescription>
                    Dados cadastrais, login, função, plano, documento e cobrança.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    {/* Dados principais */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground">Dados principais</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="fullName">Nome Completo</Label>
                                <Input id="fullName" {...register("fullName")} />
                                {errors.fullName && (
                                    <p className="text-xs text-red-500">{errors.fullName.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email (login)</Label>
                                <Input id="email" type="email" {...register("email")} />
                                {errors.email && (
                                    <p className="text-xs text-red-500">{errors.email.message}</p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="firstName">Primeiro Nome</Label>
                                <Input id="firstName" {...register("firstName")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lastName">Sobrenome</Label>
                                <Input id="lastName" {...register("lastName")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Telefone</Label>
                                <Input id="phone" {...register("phone")} placeholder="(11) 99999-9999" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Função</Label>
                                    <Select
                                        defaultValue={user.systemRole}
                                        onValueChange={(value) =>
                                            setValue("role", value as "admin" | "user")
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="user">Usuário</SelectItem>
                                            <SelectItem value="admin">Admin</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Plano</Label>
                                    <Select
                                        defaultValue={user.tier}
                                        onValueChange={(value) =>
                                            setValue(
                                                "plan",
                                                value as "SOLO" | "PRO" | "ENTERPRISE"
                                            )
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="SOLO">Solo</SelectItem>
                                            <SelectItem value="PRO">Pro</SelectItem>
                                            <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Documento */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground">Documento</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tipo de Documento</Label>
                                <Select
                                    value={docType}
                                    onValueChange={(value) => {
                                        setDocType(value)
                                        setValue("documentType", value === DOC_NONE ? "" : value)
                                    }}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={DOC_NONE}>Nenhum</SelectItem>
                                        <SelectItem value="CPF">CPF</SelectItem>
                                        <SelectItem value="CNPJ">CNPJ</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="documentNumber">Número do Documento</Label>
                                <Input id="documentNumber" {...register("documentNumber")} />
                            </div>
                        </div>
                    </div>

                    {/* Cobrança */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground">Cobrança</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="billingPostalCode">CEP</Label>
                                <Input id="billingPostalCode" {...register("billingPostalCode")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="billingAddress">Endereço</Label>
                                <Input id="billingAddress" {...register("billingAddress")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="billingAddressComplement">Complemento</Label>
                                <Input
                                    id="billingAddressComplement"
                                    {...register("billingAddressComplement")}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="billingCity">Cidade</Label>
                                <Input id="billingCity" {...register("billingCity")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="billingState">Estado (UF)</Label>
                                <Input id="billingState" {...register("billingState")} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="billingCountry">País</Label>
                                <Input id="billingCountry" {...register("billingCountry")} />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            Salvar Alterações
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    )
}
