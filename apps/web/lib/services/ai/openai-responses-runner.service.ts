import * as z3 from "zod/v3"
import * as z4 from "zod/v4"
import { zodToJsonSchema } from "zod-to-json-schema"
import type { ToolSetDefinition } from "./tools/tool-definition"
import { getOpenAIClient } from "./openai-client"

export interface ResponsesRunnerInputMessage {
  role: string
  content: unknown
  name?: string
  toolCallId?: string
}

export interface ResponsesRunnerUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface ResponsesRunnerToolCall {
  toolName: string
  input?: unknown
  invalid?: boolean
  error?: string
}

export interface ResponsesRunnerToolResult {
  toolName: string
  result?: unknown
  isError?: boolean
  error?: { message: string } | string
}

export interface ResponsesRunnerStep {
  finishReason: "tool-calls" | "stop" | "max-tool-rounds"
  toolCalls: ResponsesRunnerToolCall[]
  toolResults: ResponsesRunnerToolResult[]
  text: string
}

export interface RunOpenAIResponsesParams {
  model: string
  instructions?: string
  input: ResponsesRunnerInputMessage[]
  tools: ToolSetDefinition
  maxToolRounds?: number
}

export interface RunOpenAIResponsesResult {
  text: string
  usage: ResponsesRunnerUsage
  steps: ResponsesRunnerStep[]
}

type JSONSchema = Record<string, unknown>

function extractTextFromContent(content: unknown): string {
  if (typeof content === "string") {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part
        }

        if (part && typeof part === "object") {
          const partRecord = part as Record<string, unknown>
          if (partRecord.type === "text" && typeof partRecord.text === "string") {
            return partRecord.text
          }

          if (typeof partRecord.text === "string") {
            return partRecord.text
          }
        }

        return JSON.stringify(part)
      })
      .join("\n")
      .trim()
  }

  if (content == null) {
    return ""
  }

  return String(content)
}

function normalizeMessageRole(role: string): "system" | "developer" | "user" | "assistant" {
  if (role === "system") return "system"
  if (role === "developer") return "developer"
  if (role === "assistant") return "assistant"
  if (role === "user") return "user"

  // "tool" (ou qualquer outro papel desconhecido) é convertido para assistant.
  return "assistant"
}

function toResponseInput(messages: ResponsesRunnerInputMessage[]) {
  return messages.map((message) => ({
    role: normalizeMessageRole(message.role),
    content: extractTextFromContent(message.content),
  }))
}

function extractResponseText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const outputItems = Array.isArray(response?.output) ? response.output : []
  const collected: string[] = []

  for (const item of outputItems) {
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue
    }

    for (const contentPart of item.content) {
      if (contentPart?.type === "output_text" && typeof contentPart.text === "string") {
        collected.push(contentPart.text)
      }
    }
  }

  return collected.join("").trim()
}

function toOutputString(value: unknown): string {
  if (typeof value === "string") {
    return value
  }

  try {
    return JSON.stringify(value ?? null)
  } catch {
    return JSON.stringify({
      error: true,
      message: "Failed to serialize tool output",
    })
  }
}

function parseArguments(rawArguments: string): unknown {
  const trimmed = rawArguments?.trim()
  if (!trimmed) {
    return {}
  }

  return JSON.parse(trimmed)
}

function isZodV4Schema(schema: unknown): schema is z4.ZodType {
  return Boolean(schema && typeof schema === "object" && "_zod" in (schema as Record<string, unknown>))
}

function schemaToJsonSchema(schema: unknown, name: string): JSONSchema {
  if (isZodV4Schema(schema)) {
    return z4.toJSONSchema(schema, { target: "draft-7" }) as JSONSchema
  }

  const jsonSchema = zodToJsonSchema(schema as z3.ZodTypeAny, {
    name,
    $refStrategy: "none",
  }) as JSONSchema

  if (jsonSchema && jsonSchema.type === "object") {
    return jsonSchema
  }

  const definitions = jsonSchema.definitions as Record<string, JSONSchema> | undefined
  if (definitions?.[name]) {
    return definitions[name]
  }

  return {
    type: "object",
    additionalProperties: true,
  }
}

export async function runOpenAIResponses(
  params: RunOpenAIResponsesParams
): Promise<RunOpenAIResponsesResult> {
  const { model, instructions, tools } = params
  const maxToolRounds = params.maxToolRounds ?? 5
  const openai = getOpenAIClient()

  const usage: ResponsesRunnerUsage = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  }
  const steps: ResponsesRunnerStep[] = []

  const responseTools = Object.entries(tools).map(([name, toolDef]) => ({
    type: "function" as const,
    name,
    description: toolDef.description,
    parameters: schemaToJsonSchema(toolDef.inputSchema, name),
  }))

  let previousResponseId: string | undefined
  let currentInput: unknown = toResponseInput(params.input)
  let rounds = 0

  while (rounds < maxToolRounds) {
    const response = await openai.responses.create({
      model,
      instructions: previousResponseId ? undefined : instructions ?? null,
      input: currentInput as any,
      previous_response_id: previousResponseId,
      tools: responseTools as any,
      parallel_tool_calls: true,
    })

    if (response.usage) {
      usage.inputTokens += response.usage.input_tokens ?? 0
      usage.outputTokens += response.usage.output_tokens ?? 0
      usage.totalTokens += response.usage.total_tokens ?? 0
    }

    const text = extractResponseText(response)
    const outputItems: any[] = Array.isArray((response as any).output) ? (response as any).output : []
    const functionCalls = outputItems.filter((item) => item?.type === "function_call")

    if (functionCalls.length === 0) {
      steps.push({
        finishReason: "stop",
        toolCalls: [],
        toolResults: [],
        text,
      })

      return {
        text,
        usage,
        steps,
      }
    }

    const stepToolCalls: ResponsesRunnerToolCall[] = []
    const stepToolResults: ResponsesRunnerToolResult[] = []
    const functionOutputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = []

    for (const functionCall of functionCalls) {
      const toolName = String(functionCall.name ?? "")
      const toolDef = tools[toolName]

      let parsedArgs: unknown
      try {
        parsedArgs = parseArguments(String(functionCall.arguments ?? "{}"))
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Invalid function arguments JSON"

        stepToolCalls.push({
          toolName,
          invalid: true,
          error: errorMessage,
        })

        const toolErrorResult = {
          error: true,
          message: `Invalid arguments for tool ${toolName}: ${errorMessage}`,
        }

        stepToolResults.push({
          toolName,
          isError: true,
          result: toolErrorResult,
          error: { message: toolErrorResult.message },
        })

        functionOutputs.push({
          type: "function_call_output",
          call_id: String(functionCall.call_id),
          output: toOutputString(toolErrorResult),
        })

        continue
      }

      stepToolCalls.push({
        toolName,
        input: parsedArgs,
      })

      if (!toolDef) {
        const toolErrorResult = {
          error: true,
          message: `Tool not found: ${toolName}`,
        }

        stepToolResults.push({
          toolName,
          isError: true,
          result: toolErrorResult,
          error: { message: toolErrorResult.message },
        })

        functionOutputs.push({
          type: "function_call_output",
          call_id: String(functionCall.call_id),
          output: toOutputString(toolErrorResult),
        })

        continue
      }

      try {
        const validatedArgs = toolDef.inputSchema.parse(parsedArgs)
        const result = await toolDef.execute(validatedArgs)

        stepToolResults.push({
          toolName,
          result,
          isError: false,
        })

        functionOutputs.push({
          type: "function_call_output",
          call_id: String(functionCall.call_id),
          output: toOutputString(result),
        })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Tool execution failed"
        const toolErrorResult = {
          error: true,
          message: errorMessage,
        }

        stepToolResults.push({
          toolName,
          isError: true,
          result: toolErrorResult,
          error: { message: errorMessage },
        })

        functionOutputs.push({
          type: "function_call_output",
          call_id: String(functionCall.call_id),
          output: toOutputString(toolErrorResult),
        })
      }
    }

    steps.push({
      finishReason: "tool-calls",
      toolCalls: stepToolCalls,
      toolResults: stepToolResults,
      text,
    })

    rounds += 1
    previousResponseId = response.id
    currentInput = functionOutputs
  }

  const finalResponse = await openai.responses.create({
    model,
    previous_response_id: previousResponseId,
    input: currentInput as any,
    tools: responseTools as any,
    tool_choice: "none",
  })

  if (finalResponse.usage) {
    usage.inputTokens += finalResponse.usage.input_tokens ?? 0
    usage.outputTokens += finalResponse.usage.output_tokens ?? 0
    usage.totalTokens += finalResponse.usage.total_tokens ?? 0
  }

  const finalText = extractResponseText(finalResponse)
  steps.push({
    finishReason: "max-tool-rounds",
    toolCalls: [],
    toolResults: [],
    text: finalText,
  })

  return {
    text: finalText,
    usage,
    steps,
  }
}
