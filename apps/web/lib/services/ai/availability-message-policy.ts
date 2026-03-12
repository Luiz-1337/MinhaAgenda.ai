/**
 * Política de mensagens para disponibilidade.
 * A agenda interna do sistema é sempre a fonte de verdade.
 */

export const AVAILABILITY_TECHNICAL_FALLBACK_MESSAGE =
  "Não consegui concluir essa verificação agora. Me diga dia e horário que te ajudo a confirmar.";

const TECHNICAL_PATTERNS = [
  "tool not found",
  "invalid argument",
  "invalid json",
  "execution failed",
  "failed to",
  "timeout",
  "timed out",
  "network",
  "econn",
  "enotfound",
  "internal server error",
  "unexpected",
  "unknown error",
  "typeerror",
  "referenceerror",
  "syntaxerror",
  "cannot read",
  "undefined",
  "null",
  "stack",
  "sql",
  "database",
  "fetch failed",
  "erro interno",
  "falha de conexão",
  "falha de conexao",
  "falha técnica",
  "falha tecnica",
];

const FORBIDDEN_AGENDA_PATTERNS = [
  "nao consegui acessar a agenda",
  "nao consegui usar a agenda",
  "nao consegui consultar a agenda",
  "nao consegui abrir a agenda",
  "agenda inacessivel",
  "agenda indisponivel",
  "agenda fora do ar",
  "agenda caiu",
  "agenda nao esta disponivel",
  "agenda não está disponível",
];

function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeToolMessage(message: string): string {
  return String(message || "")
    .replace(/^error\s*:\s*/i, "")
    .replace(/^tool error\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTechnicalToolMessage(message: string): boolean {
  const normalized = normalizeForMatching(message);
  return TECHNICAL_PATTERNS.some((pattern) => normalized.includes(normalizeForMatching(pattern)));
}

export function hasForbiddenAgendaSemantics(message: string): boolean {
  const normalized = normalizeForMatching(message);
  return FORBIDDEN_AGENDA_PATTERNS.some((pattern) =>
    normalized.includes(normalizeForMatching(pattern))
  );
}

export function resolveFriendlyAvailabilityErrorMessage(
  errors: Array<{ toolName: string; error: string }>
): string | null {
  const availabilityErrors = errors.filter(
    (e) => e.toolName === "check_availability" || e.toolName === "checkAvailability"
  );

  for (const error of availabilityErrors) {
    const message = normalizeToolMessage(error.error);
    if (!message) continue;
    if (hasForbiddenAgendaSemantics(message)) continue;
    if (!isTechnicalToolMessage(message)) {
      return message;
    }
  }

  return null;
}

/**
 * Barreira final para impedir copy sugerindo indisponibilidade da agenda.
 */
export function enforceAgendaAvailabilityPolicy(text: string): string {
  if (!text || !text.trim()) return "";

  if (hasForbiddenAgendaSemantics(text)) {
    return AVAILABILITY_TECHNICAL_FALLBACK_MESSAGE;
  }

  return text;
}

