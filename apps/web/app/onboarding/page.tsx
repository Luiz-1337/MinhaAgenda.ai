"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { createSalon } from "@/app/actions/salon"
import { createSalonSchema, type CreateSalonSchema } from "@/lib/schemas"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Toaster, toast } from "sonner"

export default function OnboardingPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const form = useForm<CreateSalonSchema>({
    resolver: zodResolver(createSalonSchema),
    defaultValues: { name: "", slug: "", address: "", phone: "" },
    mode: "onChange",
  })

  function onSubmit(values: CreateSalonSchema) {
    startTransition(async () => {
      const res = await createSalon({
        name: values.name.trim(),
        slug: values.slug.trim().toLowerCase(),
        address: (values.address || "").trim(),
        phone: (values.phone || "").trim(),
      })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      toast.success("Salão criado com sucesso")
      router.replace("/")
      router.refresh()
    })
  }

  return (
    <div className="max-w-xl w-full">
      <Toaster richColors />
      <Card className="p-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">Cadastrar Salão</h1>
          <p className="text-muted-foreground text-sm">Informe os dados do seu salão</p>
        </div>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" {...form.register("name")} placeholder="Ex.: Barber Club" />
            {form.formState.errors.name && (
              <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="slug">Slug</Label>
            <div className="flex items-center rounded-md border">
              <span className="px-3 text-sm text-muted-foreground">minhaagenda.ai/</span>
              <Input id="slug" className="border-0 focus-visible:ring-0" {...form.register("slug")} placeholder="meu-salao" />
            </div>
            {form.formState.errors.slug && (
              <p className="text-destructive text-sm">{form.formState.errors.slug.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" {...form.register("address")} placeholder="Rua Exemplo, 123" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input id="phone" {...form.register("phone")} placeholder="(11) 90000-0000" />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Enviando..." : "Criar Salão"}
          </Button>
        </form>
      </Card>
    </div>
  )
}
