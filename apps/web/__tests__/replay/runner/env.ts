/**
 * Env do harness de replay. Lê REPLAY_* com fallback para EVAL_* (mesma infra
 * da suíte de eval). Aponte para um salão de TESTE — nunca produção.
 */

import type { EvalEnv } from "../../eval/runner/env"

const DEFAULT_CLIENT_PHONE = "5500900000002"

function pick(...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = process.env[k]
    if (v && v.trim()) return v.trim()
  }
  return undefined
}

export interface ReplayEnvOverrides {
  salonId?: string
  clientPhone?: string
}

export function loadReplayEnv(overrides?: ReplayEnvOverrides): EvalEnv {
  const salonId = overrides?.salonId?.trim() || pick("REPLAY_SALON_ID", "EVAL_SALON_ID")
  const professionalId = pick("REPLAY_PROFESSIONAL_ID", "EVAL_PROFESSIONAL_ID")
  const serviceId = pick("REPLAY_SERVICE_ID", "EVAL_SERVICE_ID")
  const clientPhone =
    overrides?.clientPhone?.trim() ||
    pick("REPLAY_CLIENT_PHONE", "EVAL_CLIENT_PHONE") ||
    DEFAULT_CLIENT_PHONE

  const missing: string[] = []
  if (!salonId) missing.push("REPLAY_SALON_ID (ou EVAL_SALON_ID)")
  if (!professionalId) missing.push("REPLAY_PROFESSIONAL_ID (ou EVAL_PROFESSIONAL_ID)")
  if (!serviceId) missing.push("REPLAY_SERVICE_ID (ou EVAL_SERVICE_ID)")

  if (missing.length > 0) {
    throw new Error(
      `Harness de replay sem env vars obrigatórias: ${missing.join(", ")}.\n` +
        `Rode o seed (pnpm --filter @repo/db seed:cris) e cole os REPLAY_* no .env.`
    )
  }

  return {
    salonId: salonId!,
    professionalId: professionalId!,
    serviceId: serviceId!,
    clientPhone,
  }
}
