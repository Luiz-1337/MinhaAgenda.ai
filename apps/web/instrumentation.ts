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
        // Import dinâmico para evitar problemas com Edge Runtime
        const { createMessageWorker } = await import("./workers/message-processor");
        const { logger } = await import("./lib/logger");

        // Evita criar múltiplos workers durante hot reload
        const globalAny = global as any;
        if (!globalAny._messageWorker) {
            logger.info("Starting message worker from instrumentation...");
            globalAny._messageWorker = createMessageWorker();
            logger.info("Message worker started successfully");
        }
    }
}
