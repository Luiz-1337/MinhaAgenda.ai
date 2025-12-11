"use client"

import Link from "next/link"
import { useActionState } from "react"
import { useFormStatus } from "react-dom"
import { login } from "@/app/actions/auth"
import { Card } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </Button>
  )
}

export default function LoginPage() {
  const [state, formAction] = useActionState(login, { error: "" })

  return (
    <div>
      <Card>
        <div>
          <h1>Entrar</h1>
          <p>Acesse o painel administrativo</p>
        </div>
        <form action={formAction}>
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
          Não tem conta? <Link href="/register">Cadastre-se</Link>
        </p>
      </Card>
    </div>
  )
}

