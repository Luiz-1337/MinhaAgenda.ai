"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function SettingsPage() {
  const [tab, setTab] = useState("perfil")
  const [name, setName] = useState("MinhaAgenda AI")
  const credits = 9999
  const [status, setStatus] = useState("Ativo")

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas preferências de conta e workspace</p>
      </div>

      <Card className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
            <TabsTrigger value="workspace">Workspace</TabsTrigger>
            <TabsTrigger value="senha">Senha</TabsTrigger>
          </TabsList>

          <TabsContent value={tab}>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="credits">Créditos</Label>
                <Input id="credits" value={credits} disabled />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativo">Ativo</SelectItem>
                    <SelectItem value="Inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Button className="bg-teal-600 w-full text-white hover:bg-teal-700">Atualizar Dados</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}

