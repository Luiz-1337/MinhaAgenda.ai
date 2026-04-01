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

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n  - ${missing.join("\n  - ")}`
    );
  }
}
