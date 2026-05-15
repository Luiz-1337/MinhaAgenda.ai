/**
 * Env vars required by the eval suite. Validated at startup.
 *
 * The eval runs against a real DB / Redis / OpenAI. You must point it at a
 * test/staging salon — never production.
 */

export interface EvalEnv {
  salonId: string
  professionalId: string
  serviceId: string
  /** Phone used for the simulated customer. E.164, marker prefix recommended. */
  clientPhone: string
}

const REQUIRED = [
  "EVAL_SALON_ID",
  "EVAL_PROFESSIONAL_ID",
  "EVAL_SERVICE_ID",
] as const

const DEFAULT_CLIENT_PHONE = "5500900000001"

export function loadEvalEnv(): EvalEnv {
  const missing = REQUIRED.filter((k) => !process.env[k]?.trim())
  if (missing.length > 0) {
    throw new Error(
      `Eval suite missing required env vars: ${missing.join(", ")}.\n` +
      `See apps/web/__tests__/eval/README.md for setup.`
    )
  }

  return {
    salonId: process.env.EVAL_SALON_ID!.trim(),
    professionalId: process.env.EVAL_PROFESSIONAL_ID!.trim(),
    serviceId: process.env.EVAL_SERVICE_ID!.trim(),
    clientPhone: (process.env.EVAL_CLIENT_PHONE || DEFAULT_CLIENT_PHONE).trim(),
  }
}
