import { Result, ok, fail } from "../../../shared/types"
import { DomainError, RequiredFieldError } from "../../../domain/errors"
import { IAiResponsesRunner } from "../../../domain/services/IAiResponsesRunner"
import { IRetentionRepository } from "../../../domain/repositories"
import { RecordCustomerOptOutUseCase } from "./RecordCustomerOptOutUseCase"
import { parseRetentionSentiment } from "./schemas/reengagement-message.schema"

export interface ClassifyRetentionResponseInput {
  hoursWindow: number
  limit: number
  autoOptOutConfidence: number
  model: string
}

export interface ClassifyRetentionResponseOutput {
  totalReviewed: number
  autoOptedOut: number
  dismissed: number
}

const SYSTEM_PROMPT = [
  "Voce e um classificador de sentimento de mensagens de WhatsApp em portugues brasileiro.",
  "Recebera UMA mensagem que um cliente enviou para um salao de beleza apos receber uma mensagem de marketing/reativacao.",
  "Classifique exclusivamente o tom da resposta em relacao a receber mais mensagens do salao.",
  "",
  "REGRAS:",
  "- 'annoyed' = irritacao, pedido para parar, reclamacao, hostilidade.",
  "- 'positive' = interesse, agradecimento, pergunta sobre agendamento.",
  "- 'neutral' = ambiguo, ironico, informativo, dificil de categorizar.",
  "- confidence = 0..1, sua certeza na classificacao.",
  "",
  "Retorne APENAS JSON: {\"label\": \"annoyed\" | \"neutral\" | \"positive\", \"confidence\": numero}.",
].join("\n")

/**
 * Camada 3 — varre os audits nao revisados, classifica via LLM e:
 *  - auto-opta-out se label='annoyed' AND confidence >= autoOptOutConfidence
 *  - apenas marca como reviewed/dismissed caso contrario
 *
 * Falhas individuais nao abortam o batch.
 */
export class ClassifyRetentionResponseUseCase {
  constructor(
    private retentionRepo: IRetentionRepository,
    private aiRunner: IAiResponsesRunner,
    private recordOptOut: RecordCustomerOptOutUseCase
  ) {}

  async execute(
    input: ClassifyRetentionResponseInput
  ): Promise<Result<ClassifyRetentionResponseOutput, DomainError>> {
    if (!Number.isFinite(input.hoursWindow) || input.hoursWindow <= 0) {
      return fail(new RequiredFieldError("hoursWindow"))
    }
    if (!Number.isFinite(input.limit) || input.limit <= 0) {
      return fail(new RequiredFieldError("limit"))
    }

    const audits = await this.retentionRepo.findUnreviewedAudits(
      input.hoursWindow,
      input.limit
    )

    let autoOptedOut = 0
    let dismissed = 0

    for (const audit of audits) {
      try {
        const userPrompt = `Mensagem do cliente: "${audit.responseBody.slice(0, 500)}"`
        const result = await this.aiRunner.runJson(
          {
            model: input.model,
            systemPrompt: SYSTEM_PROMPT,
            userPrompt,
            maxTokens: 60,
            temperature: 0,
            callerLabel: "ClassifyRetentionResponseUseCase",
          },
          parseRetentionSentiment
        )

        const isAnnoyed =
          result.output.label === "annoyed" &&
          result.output.confidence >= input.autoOptOutConfidence

        if (isAnnoyed) {
          const optResult = await this.recordOptOut.execute({
            salonId: audit.salonId,
            phone: audit.phone,
            reason: `auto_classified annoyed (conf=${result.output.confidence.toFixed(2)}): ${audit.responseBody.slice(0, 120)}`,
            source: "keyword",
          })
          if (optResult.success) {
            autoOptedOut += 1
            await this.retentionRepo.setAuditSentiment({
              auditId: audit.id,
              label: result.output.label,
              confidence: result.output.confidence,
              actionTaken: "auto_opt_out",
            })
            continue
          }
        }

        dismissed += 1
        await this.retentionRepo.setAuditSentiment({
          auditId: audit.id,
          label: result.output.label,
          confidence: result.output.confidence,
          actionTaken: "dismissed",
        })
      } catch {
        // skip individual failures; cron will retry tomorrow
      }
    }

    return ok({ totalReviewed: audits.length, autoOptedOut, dismissed })
  }
}
