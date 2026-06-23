/**
 * Validates that all required environment variables are present.
 * Called during server startup via instrumentation.ts.
 * Fails fast with a clear error message listing all missing vars.
 */
export function validateEnv(): void {
  const required = [
    "DATABASE_URL",
    "REDIS_URL",
    "OPENAI_API_KEY",
    "ENCRYPTION_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_SOLO",
    "STRIPE_PRICE_PRO",
    "STRIPE_CREDIT_BASIC",
    "STRIPE_CREDIT_PRO",
    "STRIPE_CREDIT_PREMIUM",
    "EVOLUTION_API_URL",
    "EVOLUTION_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;

  const missing: string[] = required.filter((key) => !process.env[key]);

  // WhatsApp Cloud API: obrigatórias em PRODUÇÃO (o token é a fronteira de
  // segurança do canal; sem APP_SECRET o webhook não valida a assinatura). Em
  // dev ficam opcionais para não travar o ambiente local. WHATSAPP_PHONE_NUMBER_ID
  // NÃO é exigida (deixou de ser roteador — o número vem por agente no banco);
  // WHATSAPP_GRAPH_VERSION tem default no código.
  if (process.env.NODE_ENV === "production") {
    const cloudRequired = [
      "WHATSAPP_CLOUD_TOKEN",
      "WHATSAPP_APP_SECRET",
      "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    ];
    missing.push(...cloudRequired.filter((key) => !process.env[key]));
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  - ${missing.join("\n  - ")}`
    );
  }
}
