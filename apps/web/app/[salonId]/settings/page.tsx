"use client"

import { useState, useEffect, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { SalonEditForm } from "@/components/dashboard/salon-edit-form"
import { ProfileEditForm } from "@/components/dashboard/profile-edit-form"
import { getCurrentSalon } from "@/app/actions/salon"
import { getCurrentProfile } from "@/app/actions/profile"
import { useSalon } from "@/contexts/salon-context"
import { toast } from "sonner"
import type { SalonDetails } from "@/app/actions/salon"
import type { ProfileDetails } from "@/app/actions/profile"

export default function SettingsPage() {
  const [tab, setTab] = useState("perfil")
  const { activeSalon } = useSalon()
  const [salonData, setSalonData] = useState<SalonDetails | null>(null)
  const [isLoadingSalon, setIsLoadingSalon] = useState(false)
  const [lastLoadedSalonId, setLastLoadedSalonId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileDetails | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)
  const [passwordData, setPasswordData] = useState({ current: "", new: "", confirm: "" })
  const [isPendingPassword, startPasswordTransition] = useTransition()

  // Função para carregar dados do salão
  const loadSalonData = async (salonId: string) => {
    if (lastLoadedSalonId === salonId && salonData?.id === salonId) {
      return // Já temos os dados corretos
    }
    
    setIsLoadingSalon(true)
    setSalonData(null)
    
    try {
      const result = await getCurrentSalon(salonId)
      if ("error" in result) {
        console.error("Erro ao carregar salão:", result.error)
        setSalonData(null)
        setLastLoadedSalonId(null)
      } else {
        setSalonData(result)
        setLastLoadedSalonId(salonId)
      }
    } catch (error) {
      console.error("Erro ao carregar salão:", error)
      setSalonData(null)
      setLastLoadedSalonId(null)
    } finally {
      setIsLoadingSalon(false)
    }
  }

  // Função para carregar dados do perfil
  const loadProfileData = async () => {
    if (profileData) {
      return // Já temos os dados
    }
    
    setIsLoadingProfile(true)
    try {
      const result = await getCurrentProfile()
      if ("error" in result) {
        console.error("Erro ao carregar perfil:", result.error)
        setProfileData(null)
      } else {
        setProfileData(result)
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error)
      setProfileData(null)
    } finally {
      setIsLoadingProfile(false)
    }
  }

  // Carrega os dados do perfil quando a aba "perfil" é selecionada
  useEffect(() => {
    if (tab === "perfil") {
      loadProfileData()
    }
  }, [tab])

  // Carrega os dados do salão quando a aba "salon" é selecionada ou quando o salão ativo muda
  useEffect(() => {
    if (tab === "salon" && activeSalon) {
      loadSalonData(activeSalon.id)
    } else if (tab !== "salon") {
      // Limpa os dados quando sair da aba
      setSalonData(null)
      setLastLoadedSalonId(null)
    }
  }, [tab, activeSalon?.id])

  // Limpa os campos de senha quando sair da aba
  useEffect(() => {
    if (tab !== "senha") {
      setPasswordData({ current: "", new: "", confirm: "" })
    }
  }, [tab])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    
    if (!passwordData.current || !passwordData.new || !passwordData.confirm) {
      toast.error("Preencha todos os campos")
      return
    }

    if (passwordData.new !== passwordData.confirm) {
      toast.error("As senhas não coincidem")
      return
    }

    if (passwordData.new.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres")
      return
    }

    startPasswordTransition(async () => {
      try {
        // TODO: Implementar chamada à API para alterar senha
        // const result = await changePassword(passwordData.current, passwordData.new)
        toast.success("Senha alterada com sucesso")
        setPasswordData({ current: "", new: "", confirm: "" })
      } catch (error) {
        toast.error("Erro ao alterar senha. Verifique a senha atual.")
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie suas preferências de conta e salão</p>
      </div>

      <Card className="p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="perfil">Perfil</TabsTrigger>
            <TabsTrigger value="salon">Meu Salão</TabsTrigger>
            <TabsTrigger value="senha">Senha</TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="mt-4">
            {isLoadingProfile ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="flex items-center justify-between rounded-md border p-4">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
                <Skeleton className="h-10 w-full" />
              </div>
            ) : profileData ? (
              <ProfileEditForm profile={profileData} />
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Erro ao carregar dados do perfil.
              </div>
            )}
          </TabsContent>

          <TabsContent value="salon" className="mt-4">
            {isLoadingSalon ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-20 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-4 w-40" />
                  <div className="space-y-3">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-4 rounded-md border p-3">
                        <Skeleton className="h-6 w-11 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-10 flex-1" />
                        <Skeleton className="h-4 w-8" />
                        <Skeleton className="h-10 flex-1" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-4 w-28" />
                  <div className="space-y-4 rounded-md border p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                      <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                      <Skeleton className="h-6 w-11 rounded-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-20 w-full" />
                    </div>
                  </div>
                </div>
                <Skeleton className="h-10 w-full" />
              </div>
            ) : salonData && activeSalon ? (
              <SalonEditForm salon={salonData} salonId={activeSalon.id} />
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Nenhum salão selecionado. Selecione um salão no menu superior.
              </div>
            )}
          </TabsContent>

          <TabsContent value="senha" className="mt-4">
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Senha Atual</Label>
                <Input 
                  id="current-password" 
                  type="password" 
                  placeholder="Digite sua senha atual"
                  value={passwordData.current}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, current: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input 
                  id="new-password" 
                  type="password" 
                  placeholder="Digite sua nova senha"
                  value={passwordData.new}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, new: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input 
                  id="confirm-password" 
                  type="password" 
                  placeholder="Confirme sua nova senha"
                  value={passwordData.confirm}
                  onChange={(e) => setPasswordData(prev => ({ ...prev, confirm: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
              <Button 
                type="submit" 
                disabled={isPendingPassword}
                className="bg-teal-600 w-full text-white hover:bg-teal-700"
              >
                {isPendingPassword ? "Alterando..." : "Alterar Senha"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  )
}

