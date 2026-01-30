"use client"

import { useEffect, useCallback, useState } from "react"
import { Loader2, MessageCircle, AlertCircle, ExternalLink } from "lucide-react"
import { toast } from "sonner"

// Tipos para o Facebook SDK
declare global {
  interface Window {
    FB: {
      init: (options: {
        appId: string
        autoLogAppEvents: boolean
        xfbml: boolean
        version: string
      }) => void
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options: FacebookLoginOptions
      ) => void
    }
    fbAsyncInit: () => void
  }
}

interface FacebookLoginResponse {
  authResponse?: {
    accessToken: string
    userID: string
    expiresIn: number
    signedRequest: string
    graphDomain: string
    data_access_expiration_time: number
  }
  status: "connected" | "not_authorized" | "unknown"
}

interface FacebookLoginOptions {
  config_id: string
  auth_type?: string
  response_type: string
  override_default_response_type: boolean
  extras: {
    sessionInfoVersion: number
    setup: {
      solutionID?: string
    }
    featureType?: string
  }
}

interface EmbeddedSignupData {
  type: string
  event: string
  data?: {
    phone_number_id?: string
    waba_id?: string
    current_step?: string
  }
}

export interface MetaEmbeddedSignupProps {
  salonId: string
  onSuccess: (data: { wabaId: string; phoneNumberId: string; phoneNumber?: string }) => void
  onError?: (error: string) => void
  disabled?: boolean
  /** Se true, usa featureType: 'only_waba_sharing' para números Twilio existentes */
  twilioNumber?: boolean
}

/**
 * Componente para Meta Embedded Signup
 * Permite usuários conectarem ou criarem WABAs diretamente na aplicação
 * 
 * Requisitos:
 * - META_APP_ID no .env
 * - META_CONFIG_ID no .env
 * - TWILIO_PARTNER_SOLUTION_ID no .env (opcional, para integração Twilio)
 */
export function MetaEmbeddedSignup({
  salonId,
  onSuccess,
  onError,
  disabled = false,
  twilioNumber = false,
}: MetaEmbeddedSignupProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [sdkLoaded, setSdkLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // IDs de configuração do Meta
  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID
  const solutionId = process.env.NEXT_PUBLIC_TWILIO_PARTNER_SOLUTION_ID

  // Carrega o Facebook SDK
  useEffect(() => {
    if (!appId) {
      setError("META_APP_ID não configurado")
      return
    }

    // Verifica se já foi carregado
    if (window.FB) {
      setSdkLoaded(true)
      return
    }

    // Define o callback de inicialização
    window.fbAsyncInit = function () {
      window.FB.init({
        appId: appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: "v21.0",
      })
      setSdkLoaded(true)
    }

    // Carrega o SDK
    const script = document.createElement("script")
    script.src = "https://connect.facebook.net/en_US/sdk.js"
    script.async = true
    script.defer = true
    script.crossOrigin = "anonymous"
    document.body.appendChild(script)

    return () => {
      // Cleanup
      const existingScript = document.querySelector('script[src*="facebook.net"]')
      if (existingScript) {
        existingScript.remove()
      }
    }
  }, [appId])

  // Listener para capturar resultado do signup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Valida origem
      if (!event.origin.endsWith("facebook.com")) {
        return
      }

      try {
        const data: EmbeddedSignupData = typeof event.data === "string" 
          ? JSON.parse(event.data) 
          : event.data

        if (data.type === "WA_EMBEDDED_SIGNUP") {
          if (data.event === "FINISH" && data.data) {
            const { phone_number_id, waba_id } = data.data

            if (phone_number_id && waba_id) {
              setIsLoading(false)
              onSuccess({
                wabaId: waba_id,
                phoneNumberId: phone_number_id,
              })
            } else {
              setIsLoading(false)
              const errorMsg = "Dados incompletos do signup. Tente novamente."
              setError(errorMsg)
              onError?.(errorMsg)
            }
          } else if (data.event === "CANCEL") {
            setIsLoading(false)
            toast.info("Conexão cancelada")
          } else if (data.event === "ERROR") {
            setIsLoading(false)
            const errorMsg = "Erro durante o processo de conexão"
            setError(errorMsg)
            onError?.(errorMsg)
          }
        }
      } catch {
        // Ignora mensagens que não são JSON válido
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [onSuccess, onError])

  const launchEmbeddedSignup = useCallback(() => {
    if (!sdkLoaded || !window.FB) {
      toast.error("Facebook SDK não carregado. Recarregue a página.")
      return
    }

    if (!configId) {
      toast.error("Configuração do Meta não encontrada")
      return
    }

    setIsLoading(true)
    setError(null)

    const loginOptions: FacebookLoginOptions = {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      extras: {
        sessionInfoVersion: 3,
        setup: {},
      },
    }

    // Adiciona Solution ID da Twilio se disponível
    if (solutionId) {
      loginOptions.extras.setup.solutionID = solutionId
    }

    // Para números Twilio existentes, pula telas de entrada/verificação de número
    if (twilioNumber) {
      loginOptions.extras.featureType = "only_waba_sharing"
    }

    window.FB.login((response: FacebookLoginResponse) => {
      if (response.status !== "connected") {
        setIsLoading(false)
        if (response.status === "not_authorized") {
          toast.error("Autorização negada. Por favor, permita o acesso ao WhatsApp Business.")
        }
      }
      // O resultado principal vem via postMessage
    }, loginOptions)
  }, [sdkLoaded, configId, solutionId, twilioNumber])

  // Se não tem configuração, mostra erro
  if (!appId || !configId) {
    return (
      <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-700 dark:text-amber-400">
        <AlertCircle size={16} />
        <span>Configuração do Meta não encontrada. Contate o suporte.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={launchEmbeddedSignup}
        disabled={disabled || isLoading || !sdkLoaded}
        className="flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#22c55e] text-white rounded-lg text-sm font-semibold shadow-md shadow-green-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 size={18} className="animate-spin" />
            <span>Conectando...</span>
          </>
        ) : (
          <>
            <MessageCircle size={18} />
            <span>Conectar com WhatsApp Business</span>
          </>
        )}
      </button>

      {!sdkLoaded && (
        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" />
          Carregando Facebook SDK...
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-600 dark:text-red-400">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Você será redirecionado para o Meta Business para conectar sua conta WhatsApp Business.{" "}
        <a
          href="https://business.facebook.com/latest/whatsapp_manager"
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-500 hover:text-indigo-600 inline-flex items-center gap-0.5"
        >
          Saiba mais <ExternalLink size={10} />
        </a>
      </p>
    </div>
  )
}
