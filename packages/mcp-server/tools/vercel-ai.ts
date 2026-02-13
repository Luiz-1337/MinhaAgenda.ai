/**
 * Adapter de compatibilidade para OpenAI Responses API
 * 
 * Este arquivo mantém compatibilidade com o import existente:
 * import { createMCPTools } from "@repo/mcp-server/tools/vercel-ai"
 * 
 * Re-exporta a nova implementação Clean Architecture de src/index.ts
 */

export { createMCPTools } from "../src/index"

// Re-exporta tipos úteis
export type { MCPTools } from "../src/presentation/tools"

