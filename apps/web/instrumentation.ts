/**
 * Next.js Instrumentation
 * 
 * Este arquivo é executado automaticamente durante a inicialização do servidor Next.js.
 * Aqui iniciamos o worker de processamento de mensagens WhatsApp.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
    // Só executa no servidor Node.js (não no Edge Runtime)
    if (process.env.NEXT_RUNTIME === "nodejs") {
        // Valida env vars antes de qualquer inicialização
        const { validateEnv } = await import("./lib/env");
        validateEnv();

        const { logger } = await import("./lib/infra/logger");

        // Em ambientes serverless (Vercel) o worker NAO deve rodar inline:
        // - Cada cold start adiciona ~20s de latencia (Redis reconnect)
        // - Compete pelos jobs com o worker dedicado da Railway
        // - Workers BullMQ requerem processo de longa duracao para funcionar bem
        // O worker dedicado roda na Railway (npm run worker:start).
        // Para forcar inline em desenvolvimento local, defina ENABLE_INLINE_WORKER=true.
        const isServerless = !!process.env.VERCEL;
        const forceInline = process.env.ENABLE_INLINE_WORKER === "true";

        if (isServerless && !forceInline) {
            logger.info(
                { vercel: !!process.env.VERCEL },
                "Skipping inline message worker (serverless env detected; worker runs dedicated on Railway)"
            );
            return;
        }

        // Import dinâmico para evitar problemas com Edge Runtime
        const { createMessageWorker } = await import("./workers/message-processor");

        // Evita criar múltiplos workers durante hot reload
        const globalAny = global as any;
        if (!globalAny._messageWorker) {
            logger.info("Starting message worker from instrumentation...");
            globalAny._messageWorker = createMessageWorker();
            logger.info("Message worker started successfully");
        }
    }
}
