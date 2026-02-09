"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
    id: z.string(),
    fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
    phone: z.string().optional(),
    role: z.enum(["admin", "user"]),
    plan: z.enum(["SOLO", "PRO", "ENTERPRISE"]),
    email: z.string().email().optional(), // Display only usually, but let's include for completeness if needed
})

type UpdateUserFormValues = z.infer<typeof updateUserSchema>

interface UserEditFormProps {
    user: {
        id: string
        fullName: string | null
        email: string
        phone: string | null
        systemRole: "admin" | "user"
        tier: "SOLO" | "PRO" | "ENTERPRISE"
    }
}

export function UserEditForm({ user }: UserEditFormProps) {
    const [isLoading, setIsLoading] = useState(false)

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
            phone: user.phone || "",
            role: user.systemRole,
            plan: user.tier,
            email: user.email
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
                <CardDescription>Gerencie os dados cadastrais, função e plano do usuário.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="fullName">Nome Completo</Label>
                            <Input id="fullName" {...register("fullName")} />
                            {errors.fullName && (
                                <p className="text-xs text-red-500">{errors.fullName.message}</p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" value={user.email} disabled className="bg-muted" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input id="phone" {...register("phone")} placeholder="(11) 99999-9999" />
                        </div>
                        <div className="space-y-2">
                            <Label>Função</Label>
                            <Select
                                defaultValue={user.systemRole}
                                onValueChange={(value) => setValue("role", value as "admin" | "user")}
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
                                onValueChange={(value) => setValue("plan", value as "SOLO" | "PRO" | "ENTERPRISE")}
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

                    <div className="flex justify-end pt-4">
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
