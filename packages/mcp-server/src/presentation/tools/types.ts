import { z } from "zod"

export interface ToolDefinition {
  description: string
  inputSchema: z.ZodTypeAny
  execute: (input: any) => Promise<unknown> | unknown
}

export type ToolSet = Record<string, ToolDefinition>
