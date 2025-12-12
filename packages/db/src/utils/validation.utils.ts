import { type ZodError } from "zod"

export function formatZodError(error: ZodError): string {
  if (!error.issues || error.issues.length === 0) {
    return "Erro de validação desconhecido"
  }
  
  const issue = error.issues[0]
  return issue.message || "Erro de validação"
}
