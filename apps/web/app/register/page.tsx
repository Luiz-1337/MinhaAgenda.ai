"use client"

import Link from "next/link"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { signup } from "@/app/actions/auth"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Cadastrando..." : "Cadastrar"}
    </Button>
  )
}

export default function RegisterPage() {
  const [state, formAction] = useActionState(signup, { error: "" })

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md p-6">
        <div className="mb-4">
          <h1 className="text-xl font-semibold">Cadastrar</h1>
          <p className="text-muted-foreground text-sm">Crie sua conta para acessar</p>
        </div>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome Completo</Label>
            <Input id="full_name" name="full_name" placeholder="Seu nome" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" placeholder="seuemail@exemplo.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          <SubmitButton />
        </form>
        {state?.error && <p className="text-destructive mt-4 text-sm">{state.error}</p>}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Já tenho conta. <Link href="/login" className="underline">Entrar</Link>
        </p>
      </Card>
    </div>
  )
}
