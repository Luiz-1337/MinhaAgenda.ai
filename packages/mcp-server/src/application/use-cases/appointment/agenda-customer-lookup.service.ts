import { domainServices } from "@repo/db"

/**
 * O que a cliente já tem marcado na agenda oficial do salão (ex.: Belasis), onde
 * a recepção também agenda. Embrulha `refreshCustomerAppointmentsFromAgenda` do
 * @repo/db para os casos de uso: nunca lança e sempre devolve as listas.
 *
 * - `no_agenda`: o salão não tem agenda oficial — nada muda no fluxo;
 * - `checked` / `recent`: a agenda foi consultada (agora, ou há instantes);
 * - `failed`: a agenda não respondeu (ou demorou demais); o que se sabe é só o
 *   que está aqui.
 */
export interface AgendaCustomerLookup {
  status: "no_agenda" | "checked" | "recent" | "failed"
  /** Horários futuros de lá que passaram a existir aqui nesta consulta. */
  imported: Array<{ appointmentId: string; start: Date; end: Date; professionalId: string; serviceId: string }>
  /** Horários futuros de lá que não puderam vir (profissional ou serviço sem par aqui). */
  unlinked: Array<{ externalId: string; start: Date; end: Date }>
  /** Os de `unlinked` que aparecem pela primeira vez. */
  newUnlinked: Array<{ externalId: string; start: Date; end: Date }>
}

/**
 * Quanto esperar pela agenda oficial. A cliente está esperando a resposta no
 * WhatsApp: uma agenda lenta não pode segurar a conversa. Passado o prazo, a
 * consulta conta como "não respondeu" (e segue em segundo plano — o que ela
 * trouxer já estará aqui na próxima mensagem).
 */
export const AGENDA_LOOKUP_TIMEOUT_MS = 20_000

const FAILED: AgendaCustomerLookup = { status: "failed", imported: [], unlinked: [], newUnlinked: [] }

export async function lookupCustomerInAgenda(
  salonId: string,
  customerId: string,
  options: { timeoutMs?: number } = {}
): Promise<AgendaCustomerLookup> {
  const lookup = (async (): Promise<AgendaCustomerLookup> => {
    try {
      const result = await domainServices.refreshCustomerAppointmentsFromAgenda({ salonId, customerId })
      return {
        status: result?.status ?? "no_agenda",
        imported: result?.imported ?? [],
        unlinked: result?.unlinked ?? [],
        newUnlinked: result?.newUnlinked ?? [],
      }
    } catch {
      return FAILED
    }
  })()

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<AgendaCustomerLookup>((resolve) => {
    timer = setTimeout(() => resolve(FAILED), options.timeoutMs ?? AGENDA_LOOKUP_TIMEOUT_MS)
  })
  try {
    return await Promise.race([lookup, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
