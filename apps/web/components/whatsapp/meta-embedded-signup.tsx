"use client"

import { useEffect, useCallback, useRef, useState } from "react"
import { Loader2, MessageCircle, AlertCircle, ExternalLink, QrCode } from "lucide-react"
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
    // Presente quando response_type='code' (Embedded Signup): o authorization
    // code a ser trocado no servidor pelo access token do CLIENTE.
    code?: string
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

// Qual fluxo de Embedded Signup está em andamento (para o estado de loading por botão).
type SignupFlow = "standard" | "coexistence"

// Valor do extras.featureType que ativa o onboarding via app do WhatsApp Business
// (Coexistência / QR Code). O antigo "coexistence" foi descontinuado pela Meta.
const COEXISTENCE_FEATURE_TYPE = "whatsapp_business_app_onboarding"

// Evento de conclusão do fluxo de Coexistência. NÃO é o "FINISH" do fluxo
// padrão, e o payload traz SÓ o waba_id — sem phone_number_id:
//   { type: "WA_EMBEDDED_SIGNUP", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
//     data: { waba_id: "..." }, version: 3 }
// Tratar só "FINISH" fazia a Coexistência terminar na Meta e morrer aqui em
// silêncio (o número ficava conectado lá e o salão nunca era gravado).
const COEXISTENCE_FINISH_EVENT = "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"

// Origens aceitas no postMessage do signup: facebook.com e subdomínios, só https.
const META_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*facebook\.com$/

// Libera os botões se nenhum evento de signup chegar (ex.: popup fechado sem concluir).
const SIGNUP_TIMEOUT_MS = 90_000

// Após receber os ids (postMessage), espera brevemente pelo `code` (callback do
// FB.login) antes de concluir sem ele. Os dois chegam ~juntos no fim do fluxo,
// em ordem imprevisível; sem code, conectamos mesmo assim (fallback = piloto).
const CODE_GRACE_MS = 4_000

export interface MetaEmbeddedSignupProps {
  salonId: string
  onSuccess: (data: {
    wabaId: string
    // Ausente na Coexistência: a Meta não manda o phone_number_id no evento de
    // conclusão. O servidor resolve pela WABA depois de trocar o `code`.
    phoneNumberId?: string
    phoneNumber?: string
    // authorization code do Embedded Signup (trocado no servidor pelo token do
    // cliente). Ausente no caminho manual/legado => servidor usa token da plataforma.
    code?: string
    // Qual botão originou a conexão (número dedicado vs Coexistência/QR).
    flow?: SignupFlow
  }) => void
  onError?: (error: string) => void
  disabled?: boolean
}

/**
 * Componente para Meta Embedded Signup
 * Permite conectar um número à WhatsApp Cloud API de duas formas:
 *
 *  1. WhatsApp Business (padrão): seleciona/cria a WABA e registra um número
 *     dedicado na Cloud API.
 *  2. QR Code (Coexistência): conecta o app do WhatsApp Business já existente
 *     escaneando um QR, mantendo app + Cloud API no MESMO número.
 *     Ativado por extras.featureType = "whatsapp_business_app_onboarding".
 *
 * Requisitos (.env):
 * - NEXT_PUBLIC_META_APP_ID
 * - NEXT_PUBLIC_META_CONFIG_ID
 * - NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID (necessária p/ habilitar o botão QR;
 *   precisa de uma config do Embedded Signup preparada para "WhatsApp Business
 *   app onboarding" — NÃO usar a config padrão aqui)
 * - NEXT_PUBLIC_META_SOLUTION_ID (opcional; obrigatória se a conta opera como
 *   Solution Partner — entra em extras.setup.solutionID nos dois fluxos)
 */
export function MetaEmbeddedSignup({
  salonId,
  onSuccess,
  onError,
  disabled = false,
}: MetaEmbeddedSignupProps) {
  const [loadingFlow, setLoadingFlow] = useState<SignupFlow | null>(null)
  const [sdkLoaded, setSdkLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // IDs de configuração do Meta
  const appId = process.env.NEXT_PUBLIC_META_APP_ID
  const configId = process.env.NEXT_PUBLIC_META_CONFIG_ID
  // Config dedicada ao fluxo de Coexistência. SEM fallback para o config padrão:
  // a Coexistência exige uma configuração do Embedded Signup preparada para
  // "WhatsApp Business app onboarding". Disparar o featureType de coexistência
  // contra o config padrão abriria o fluxo errado (ou falharia) em silêncio.
  const coexistenceConfigId = process.env.NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID
  // Solution ID do Tech Provider (obrigatório se a conta opera como Solution Partner).
  const solutionId = process.env.NEXT_PUBLIC_META_SOLUTION_ID

  const isLoading = loadingFlow !== null

  // Timeout de segurança para destravar os botões se o signup não retornar evento.
  const signupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearSignupTimeout = useCallback(() => {
    if (signupTimeout.current) {
      clearTimeout(signupTimeout.current)
      signupTimeout.current = null
    }
  }, [])
  const resetLoading = useCallback(() => {
    clearSignupTimeout()
    setLoadingFlow(null)
  }, [clearSignupTimeout])

  // Buffer do resultado. O `code` (callback do FB.login) e os ids (postMessage
  // FINISH) chegam em ordem imprevisível; juntamos os dois antes de disparar
  // onSuccess uma única vez (firedRef). flowRef guarda qual botão originou (não
  // depende do estado, que pode ter sido resetado no momento do disparo).
  const codeRef = useRef<string | undefined>(undefined)
  const signupDataRef = useRef<{ phoneNumberId?: string; wabaId: string } | null>(null)
  const flowRef = useRef<SignupFlow | null>(null)
  const firedRef = useRef(false)
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearGrace = useCallback(() => {
    if (graceTimer.current) {
      clearTimeout(graceTimer.current)
      graceTimer.current = null
    }
  }, [])

  // Dispara onSuccess UMA vez com o que tivermos (ids obrigatórios; code opcional).
  const fireSuccess = useCallback(() => {
    if (firedRef.current) return
    const data = signupDataRef.current
    if (!data) return
    firedRef.current = true
    clearGrace()
    resetLoading()
    onSuccess({
      wabaId: data.wabaId,
      phoneNumberId: data.phoneNumberId,
      code: codeRef.current,
      flow: flowRef.current ?? undefined,
    })
  }, [clearGrace, resetLoading, onSuccess])

  // Conclui quando temos os ids: se o code já veio, dispara já; senão espera uma
  // janela de graça pelo code e conclui mesmo sem ele (fallback = token plataforma).
  const tryComplete = useCallback(() => {
    if (firedRef.current || !signupDataRef.current) return
    if (codeRef.current) {
      fireSuccess()
      return
    }
    // Sem phoneNumberId (Coexistência) o `code` é OBRIGATÓRIO: é ele que vira o
    // token do cliente, e é o token que resolve o número na WABA. Concluir sem
    // code aqui só geraria erro no servidor — então seguimos esperando, e quem
    // avisa o dono é o timeout de SIGNUP_TIMEOUT_MS. A janela de graça abaixo
    // existe para o fluxo PADRÃO, onde o número já veio e o envio pode cair no
    // token da plataforma.
    if (!signupDataRef.current.phoneNumberId) return
    if (!graceTimer.current) {
      graceTimer.current = setTimeout(() => fireSuccess(), CODE_GRACE_MS)
    }
  }, [fireSuccess])

  // Limpa timeouts pendentes ao desmontar.
  useEffect(() => () => {
    clearSignupTimeout()
    clearGrace()
  }, [clearSignupTimeout, clearGrace])

  // Carrega o Facebook SDK (uma única vez por montagem)
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
        version: "v22.0",
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

  // Listener para capturar resultado do signup (compartilhado pelos dois fluxos)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Valida origem: tem que ser facebook.com ou um subdomínio dele, sempre
      // https. `endsWith("facebook.com")` sozinho aceitava sósias registráveis
      // (`https://evilfacebook.com`), e esta é a ÚNICA autenticação da mensagem
      // — um FINISH forjado dispara a conexão.
      if (!META_ORIGIN.test(event.origin)) {
        return
      }

      try {
        const data: EmbeddedSignupData = typeof event.data === "string"
          ? JSON.parse(event.data)
          : event.data

        if (data.type === "WA_EMBEDDED_SIGNUP") {
          const isCoexistenceFinish = data.event === COEXISTENCE_FINISH_EVENT
          if ((data.event === "FINISH" || isCoexistenceFinish) && data.data) {
            const { phone_number_id, waba_id } = data.data

            // Coexistência: o waba_id sozinho basta — o phone_number_id é
            // resolvido no servidor. No fluxo padrão os dois vêm no evento e
            // exigimos ambos (sem waba_id não há como assinar o webhook).
            if (waba_id && (phone_number_id || isCoexistenceFinish)) {
              // Bufferiza o que veio e tenta concluir (aguarda o `code` do callback).
              signupDataRef.current = { phoneNumberId: phone_number_id, wabaId: waba_id }
              tryComplete()
            } else {
              resetLoading()
              const errorMsg = "Dados incompletos do signup. Tente novamente."
              setError(errorMsg)
              onError?.(errorMsg)
            }
          } else if (data.event === "CANCEL") {
            resetLoading()
            toast.info("Conexão cancelada")
          } else if (data.event === "ERROR") {
            resetLoading()
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
  }, [onError, resetLoading, tryComplete])

  const launchEmbeddedSignup = useCallback(
    (flow: SignupFlow) => {
      if (!sdkLoaded || !window.FB) {
        toast.error("Facebook SDK não carregado. Recarregue a página.")
        return
      }

      const cfgId = flow === "coexistence" ? coexistenceConfigId : configId
      if (!cfgId) {
        toast.error(
          flow === "coexistence"
            ? "Coexistência não configurada (NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID ausente)."
            : "Configuração do Meta não encontrada"
        )
        return
      }

      setLoadingFlow(flow)
      setError(null)

      // Reinicia o buffer de resultado a cada tentativa (code + ids + guard).
      firedRef.current = false
      codeRef.current = undefined
      signupDataRef.current = null
      flowRef.current = flow
      clearGrace()

      // Destrava os botões caso o signup não retorne nenhum evento (popup fechado etc.).
      clearSignupTimeout()
      signupTimeout.current = setTimeout(() => {
        setLoadingFlow(null)
        // A Meta deu sinal de vida (o `code` da autorização, ou o evento com os
        // dados da conta) e ainda assim não foi possível concluir — falta a
        // outra metade. Ficar calado aqui é o pior dos mundos: a conta aparece
        // conectada na Meta e o painel não sabe de nada. Popup fechado no meio,
        // sem sinal nenhum, é desistência — esse segue silencioso.
        if (!firedRef.current && (codeRef.current || signupDataRef.current)) {
          const msg =
            'A Meta não devolveu tudo o que precisamos para concluir a conexão. Clique em "Concluir" no popup da Meta; se persistir, tente conectar novamente.'
          setError(msg)
          onError?.(msg)
        }
      }, SIGNUP_TIMEOUT_MS)

      const loginOptions: FacebookLoginOptions = {
        config_id: cfgId,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          sessionInfoVersion: 3,
          setup: solutionId ? { solutionID: solutionId } : {},
          // QR/Coexistência: onboarding do número que já está no app WhatsApp Business.
          ...(flow === "coexistence"
            ? { featureType: COEXISTENCE_FEATURE_TYPE }
            : {}),
        },
      }

      window.FB.login((response: FacebookLoginResponse) => {
        if (response.status === "connected") {
          // Captura o authorization code (response_type='code'). Os ids chegam
          // via postMessage; tryComplete junta os dois e dispara onSuccess.
          codeRef.current = response.authResponse?.code
          tryComplete()
        } else {
          resetLoading()
          if (response.status === "not_authorized") {
            toast.error("Autorização negada. Por favor, permita o acesso ao WhatsApp Business.")
          }
        }
      }, loginOptions)
    },
    [sdkLoaded, configId, coexistenceConfigId, solutionId, clearSignupTimeout, clearGrace, resetLoading, tryComplete, onError]
  )

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
    <div className="flex flex-col gap-4">
      {/* Opção 1 — WhatsApp Business (número dedicado na Cloud API) */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => launchEmbeddedSignup("standard")}
          disabled={disabled || isLoading || !sdkLoaded}
          aria-busy={loadingFlow === "standard"}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-[#25D366] hover:bg-[#22c55e] text-white rounded-lg text-sm font-semibold shadow-md shadow-green-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingFlow === "standard" ? (
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
        <p className="text-xs text-muted-foreground px-1">
          Use um número novo/dedicado. Você seleciona ou cria a conta e registra o número na Meta.
        </p>
      </div>

      {/* Opção 2 — QR Code / Coexistência (usa o app WhatsApp Business atual) */}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => launchEmbeddedSignup("coexistence")}
          disabled={disabled || isLoading || !sdkLoaded || !coexistenceConfigId}
          aria-busy={loadingFlow === "coexistence"}
          className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-[#25D366] text-[#075E54] dark:text-[#25D366] bg-transparent hover:bg-[#25D366]/10 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingFlow === "coexistence" ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              <span>Gerando QR Code...</span>
            </>
          ) : (
            <>
              <QrCode size={18} />
              <span>Conectar via QR Code</span>
            </>
          )}
        </button>
        <p className="text-xs text-muted-foreground px-1">
          Use o número que já está no seu app WhatsApp Business. Você escaneia um QR e mantém o
          app + automação juntos no mesmo número (Coexistência).
          {!coexistenceConfigId && (
            <span className="block mt-0.5 text-amber-600 dark:text-amber-400">
              Indisponível: defina <code>NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID</code> com a
              configuração de Coexistência criada no painel da Meta.
            </span>
          )}
        </p>
      </div>

      {!sdkLoaded && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
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

      <p className="text-xs text-muted-foreground">
        Você será redirecionado para o Meta Business para conectar sua conta WhatsApp Business.{" "}
        <a
          href="https://business.facebook.com/latest/whatsapp_manager"
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-accent/80 inline-flex items-center gap-0.5"
        >
          Saiba mais <ExternalLink size={10} />
        </a>
      </p>
    </div>
  )
}
