/**
 * StageTimer — instrumentacao leve de pipelines multi-estagio.
 *
 * Uso:
 *   const timer = new StageTimer("webhook", { messageId, salonId });
 *   timer.mark("after_parse");
 *   // ... faz algo
 *   timer.mark("after_db_query");
 *   timer.flush(logger); // emite 1 log estruturado com todos os stages + deltas
 *
 * O log final tem formato:
 *   { pipeline, messageId, totalMs, stages: [{ name, tMs, deltaMs }] }
 *
 * Assim um `grep messageId=xxx` no log mostra exatamente onde cada ms foi gasto.
 */

export interface StageTimerContext {
  messageId?: string
  salonId?: string
  chatId?: string
  jobId?: string | number
  [key: string]: unknown
}

export interface StageRecord {
  name: string
  tMs: number // tempo acumulado desde o inicio do timer
  deltaMs: number // tempo desde o ultimo mark
}

export interface MinimalLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void
}

export class StageTimer {
  private readonly startTime: number
  private readonly stages: StageRecord[] = []
  private lastMarkTime: number

  constructor(
    private readonly pipeline: string,
    private readonly context: StageTimerContext = {},
    startTimeMs?: number
  ) {
    this.startTime = startTimeMs ?? Date.now()
    this.lastMarkTime = this.startTime
  }

  /**
   * Marca um estagio com o timestamp atual.
   * Computa deltaMs desde o mark anterior e tMs desde o inicio.
   */
  mark(name: string): void {
    const now = Date.now()
    this.stages.push({
      name,
      tMs: now - this.startTime,
      deltaMs: now - this.lastMarkTime,
    })
    this.lastMarkTime = now
  }

  /**
   * Finaliza o timer e emite 1 log estruturado com todos os stages.
   * Tambem marca `done` automaticamente se nenhum mark foi feito com esse nome.
   */
  flush(logger: MinimalLogger, extra?: Record<string, unknown>): void {
    if (this.stages.length === 0 || this.stages[this.stages.length - 1].name !== "done") {
      this.mark("done")
    }

    const totalMs = this.stages[this.stages.length - 1].tMs
    const slowest = [...this.stages]
      .sort((a, b) => b.deltaMs - a.deltaMs)
      .slice(0, 3)
      .map((s) => ({ name: s.name, deltaMs: s.deltaMs }))

    logger.info(
      {
        pipeline: this.pipeline,
        ...this.context,
        totalMs,
        stages: this.stages,
        slowestStages: slowest,
        ...extra,
      },
      `[trace] ${this.pipeline} completed in ${totalMs}ms`
    )
  }

  /**
   * Retorna totalMs atual sem finalizar.
   */
  totalMs(): number {
    return Date.now() - this.startTime
  }

  /**
   * Acesso aos stages registrados (util para merge de timers aninhados).
   */
  getStages(): ReadonlyArray<StageRecord> {
    return this.stages
  }
}
