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
    <Button type="submit" disabled={pending}>
      {pending ? "Cadastrando..." : "Cadastrar"}
    </Button>
  )
}

export default function RegisterPage() {
  const [state, formAction] = useActionState(signup, { error: "" })

  return (
    <div>
      <Card>
        <div>
          <h1>Cadastrar</h1>
          <p>Crie sua conta para acessar</p>
        </div>
        <form action={formAction}>
          <div>
            <Label htmlFor="full_name">Nome Completo</Label>
            <Input id="full_name" name="full_name" placeholder="Seu nome" required />
          </div>
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" placeholder="seuemail@exemplo.com" required />
          </div>
          <div>
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" placeholder="••••••••" required />
          </div>
          <SubmitButton />
        </form>
        {state?.error && <p>{state.error}</p>}
        <p>
          Já tenho conta. <Link href="/login">Entrar</Link>
        </p>
      </Card>
    </div>
  )
}
