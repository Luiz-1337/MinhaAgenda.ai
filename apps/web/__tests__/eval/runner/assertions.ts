/**
 * Assertion evaluators. Each takes a turn result and returns an array of
 * failure strings (empty array = pass).
 */

import type { GenerateResponseResult } from "@/lib/services/ai/generate-response.service"
import type { ResponsesRunnerStep } from "@/lib/services/ai/openai-responses-runner.service"
import type { TextExpectation, ToolCallExpectation } from "../types"

function countSentences(text: string): number {
  if (!text.trim()) return 0
  // Split on terminal punctuation followed by whitespace or end-of-string.
  // Ignore ellipses and decimals.
  const matches = text.match(/[^.!?]+(?:[.!?](?!\d)|$)/g)
  if (!matches) return 1
  return matches.filter((s) => s.trim().length > 0).length
}

export function checkText(
  text: string,
  expectation: TextExpectation
): string[] {
  const failures: string[] = []

  if (expectation.maxSentences !== undefined) {
    const n = countSentences(text)
    if (n > expectation.maxSentences) {
      failures.push(
        `text: expected ≤${expectation.maxSentences} sentences, got ${n}`
      )
    }
  }

  if (expectation.maxChars !== undefined) {
    if (text.length > expectation.maxChars) {
      failures.push(
        `text: expected ≤${expectation.maxChars} chars, got ${text.length}`
      )
    }
  }

  if (expectation.mustNotMatch) {
    for (const re of expectation.mustNotMatch) {
      if (re.test(text)) {
        failures.push(`text: must not match ${re}, but did`)
      }
    }
  }

  if (expectation.mustMatchAny) {
    const hit = expectation.mustMatchAny.some((re) => re.test(text))
    if (!hit) {
      failures.push(
        `text: must match at least one of [${expectation.mustMatchAny
          .map(String)
          .join(", ")}], none matched`
      )
    }
  }

  if (expectation.mustMatchAll) {
    for (const re of expectation.mustMatchAll) {
      if (!re.test(text)) {
        failures.push(`text: must match ${re}, did not`)
      }
    }
  }

  return failures
}

interface FlatToolCall {
  toolName: string
  input: unknown
}

function flattenToolCalls(steps: ResponsesRunnerStep[]): FlatToolCall[] {
  const out: FlatToolCall[] = []
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      out.push({ toolName: call.toolName, input: call.input })
    }
  }
  return out
}

export function checkTools(
  steps: ResponsesRunnerStep[],
  expectation: ToolCallExpectation
): string[] {
  const failures: string[] = []
  const calls = flattenToolCalls(steps)
  const calledNames = new Set(calls.map((c) => c.toolName))

  if (expectation.required) {
    for (const name of expectation.required) {
      if (!calledNames.has(name)) {
        failures.push(
          `tools: required '${name}' was not called (called: [${[...calledNames].join(", ") || "none"}])`
        )
      }
    }
  }

  if (expectation.forbidden) {
    for (const name of expectation.forbidden) {
      if (calledNames.has(name)) {
        failures.push(`tools: forbidden '${name}' was called`)
      }
    }
  }

  if (expectation.args) {
    for (const [toolName, spec] of Object.entries(expectation.args)) {
      const callsForTool = calls.filter((c) => c.toolName === toolName)
      if (callsForTool.length === 0) {
        // If the tool isn't required, skip arg checks silently. If it IS
        // required, the missing-tool failure is already recorded above.
        continue
      }
      // We check the FIRST call of each tool. Most cases only call each tool once
      // per turn; for multi-call scenarios, write a custom assertion.
      const call = callsForTool[0]!
      const input =
        call.input && typeof call.input === "object"
          ? (call.input as Record<string, unknown>)
          : {}

      if (spec.mustHaveKeys) {
        for (const k of spec.mustHaveKeys) {
          if (!(k in input) || input[k] === undefined || input[k] === null || input[k] === "") {
            failures.push(`tools.${toolName}: missing required arg '${k}'`)
          }
        }
      }
      if (spec.mustNotHaveKeys) {
        for (const k of spec.mustNotHaveKeys) {
          if (k in input && input[k] !== undefined && input[k] !== null) {
            failures.push(`tools.${toolName}: arg '${k}' should be absent, got ${JSON.stringify(input[k])}`)
          }
        }
      }
      if (spec.matches) {
        for (const [k, re] of Object.entries(spec.matches)) {
          const v = input[k]
          if (v === undefined) continue // covered by mustHaveKeys if required
          const s = typeof v === "string" ? v : JSON.stringify(v)
          if (!re.test(s)) {
            failures.push(`tools.${toolName}.${k}: value ${JSON.stringify(v)} does not match ${re}`)
          }
        }
      }
    }
  }

  return failures
}

/**
 * Returns all numeric/time-like tokens in the text. Used to enforce that the
 * agent doesn't invent prices or hours not present in any tool result.
 */
export function extractCandidateValues(text: string): string[] {
  const out: string[] = []
  // Times like 10h, 10:00, 14h30
  const timeRe = /\b(\d{1,2})(?:h|:)(\d{0,2})\b/gi
  let m: RegExpExecArray | null
  while ((m = timeRe.exec(text)) !== null) {
    out.push(m[0]!)
  }
  // Prices like R$ 50, R$ 49,90, 49,90, 50.00
  const priceRe = /R?\$?\s?\d{1,4}[.,]\d{2}\b/gi
  while ((m = priceRe.exec(text)) !== null) {
    out.push(m[0]!)
  }
  return out
}

export function flattenToolResultsText(
  steps: ResponsesRunnerStep[]
): string {
  const parts: string[] = []
  for (const step of steps) {
    for (const r of step.toolResults ?? []) {
      try {
        parts.push(JSON.stringify(r.result ?? r))
      } catch {
        parts.push(String(r.result ?? r))
      }
    }
  }
  return parts.join("\n")
}

export function runCustomAssertion(
  result: GenerateResponseResult,
  steps: ResponsesRunnerStep[],
  custom: (r: GenerateResponseResult, s: ResponsesRunnerStep[]) => string | null
): string[] {
  try {
    const msg = custom(result, steps)
    return msg ? [`custom: ${msg}`] : []
  } catch (err) {
    return [`custom: threw ${err instanceof Error ? err.message : String(err)}`]
  }
}
