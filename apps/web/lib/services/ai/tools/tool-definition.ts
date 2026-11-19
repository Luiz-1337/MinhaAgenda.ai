import { z } from "zod"

export interface ToolDefinition {
  description: string
  inputSchema: z.ZodTypeAny
  // Sintaxe de método: o parâmetro é bivariante, então cada tool declara o tipo
  // do seu próprio input (já validado pelo inputSchema antes da chamada).
  execute(input: unknown): Promise<unknown> | unknown
}

export type ToolSetDefinition = Record<string, ToolDefinition>
