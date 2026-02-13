import { z } from "zod"

export interface ToolDefinition {
  description: string
  inputSchema: z.ZodTypeAny
  execute: (input: any) => Promise<unknown> | unknown
}

export type ToolSetDefinition = Record<string, ToolDefinition>
