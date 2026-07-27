import type { LucideIcon } from "lucide-react"
import { Bot } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Logo da marca — fonte única do lockup (badge + wordmark).
 *
 * Antes deste componente o bloco estava copiado à mão em 11 telas, com quatro
 * tamanhos, dois tokens de cor (`accent` e `brand-blue`, que têm o MESMO valor)
 * e duas grafias diferentes do wordmark. Trocar o logo significava editar 11
 * arquivos. Qualquer tela nova deve usar este componente, nunca recriar o bloco.
 */

type LogoSize = "sm" | "md" | "lg" | "xl"

const SIZES: Record<LogoSize, { badge: string; icon: number; text: string }> = {
  sm: { badge: "w-7 h-7", icon: 18, text: "text-base" }, // sidebars (painel, admin)
  md: { badge: "w-8 h-8", icon: 20, text: "text-lg" }, // navbar da landing
  lg: { badge: "w-8 h-8", icon: 20, text: "text-xl" }, // headers de páginas públicas
  xl: { badge: "w-10 h-10", icon: 24, text: "text-2xl" }, // telas de auth e onboarding
}

interface LogoProps {
  size?: LogoSize
  /** Ícone do badge. Trocar apenas para sinalizar área (ex.: Shield no admin). */
  icon?: LucideIcon
  /** `false` renderiza só o wordmark, sem o badge (ex.: rodapé da landing). */
  showIcon?: boolean
  /** Classes do wrapper (ex.: `mb-10` no espaçamento das telas de auth). */
  className?: string
  /** Override da cor do wordmark (ex.: `text-sidebar-foreground` nas sidebars). */
  textClassName?: string
}

export function Logo({
  size = "md",
  icon: Icon = Bot,
  showIcon = true,
  className,
  textClassName,
}: LogoProps) {
  const { badge, icon, text } = SIZES[size]

  return (
    // <span> e não <div>: o logo vive dentro de <button> e <a> em várias telas,
    // que só aceitam phrasing content.
    <span className={cn("flex items-center gap-2", className)}>
      {showIcon && (
        <span
          className={cn(
            "rounded-md bg-accent flex items-center justify-center shrink-0",
            badge
          )}
        >
          <Icon className="text-accent-foreground" size={icon} />
        </span>
      )}
      <span className={cn("font-bold tracking-tight text-foreground", text, textClassName)}>
        minha<span className="text-accent">agenda</span>.ai
      </span>
    </span>
  )
}
