import { describe, expect, it, vi } from "vitest"
import { isTransientDbError, withDbRetry } from "../../../src/shared/utils/db-retry"

describe("isTransientDbError", () => {
  it("detecta SQLSTATE transitório (08006, 57014, 53300, 40P01)", () => {
    expect(isTransientDbError({ code: "08006" })).toBe(true)
    expect(isTransientDbError({ code: "57014" })).toBe(true)
    expect(isTransientDbError({ code: "53300" })).toBe(true)
    expect(isTransientDbError({ code: "40P01" })).toBe(true)
  })

  it("detecta erros de rede Node (ECONNRESET, ETIMEDOUT, ECONNREFUSED)", () => {
    expect(isTransientDbError({ code: "ECONNRESET" })).toBe(true)
    expect(isTransientDbError({ code: "ETIMEDOUT" })).toBe(true)
    expect(isTransientDbError({ code: "ECONNREFUSED" })).toBe(true)
  })

  it("detecta por mensagem quando o code não está presente", () => {
    expect(isTransientDbError(new Error("Failed query: SELECT 1"))).toBe(true)
    expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true)
    expect(isTransientDbError(new Error("statement timeout"))).toBe(true)
    expect(isTransientDbError(new Error("too many clients already"))).toBe(true)
  })

  it("desce no err.cause para erros embrulhados", () => {
    const cause = new Error("Failed query: SELECT 1")
    const wrapped = new Error("Drizzle error")
    ;(wrapped as Error & { cause: unknown }).cause = cause
    expect(isTransientDbError(wrapped)).toBe(true)
  })

  it("não trata erros lógicos como transitórios", () => {
    expect(isTransientDbError({ code: "23505" })).toBe(false) // unique_violation
    expect(isTransientDbError({ code: "23503" })).toBe(false) // foreign_key_violation
    expect(isTransientDbError(new Error("Salão ed4cb777 não encontrado"))).toBe(false)
    expect(isTransientDbError(undefined)).toBe(false)
    expect(isTransientDbError(null)).toBe(false)
    expect(isTransientDbError("string")).toBe(false)
  })
})

describe("withDbRetry", () => {
  it("retorna direto sem retry quando a query passa", async () => {
    const fn = vi.fn().mockResolvedValue({ id: 1 })
    const result = await withDbRetry(fn)
    expect(result).toEqual({ id: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("faz retry em erro transitório e sucede na 2ª tentativa", async () => {
    const transient = Object.assign(new Error("Failed query"), { code: "08006" })
    const fn = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce({ id: 1 })

    const onRetry = vi.fn()
    const result = await withDbRetry(fn, { initialDelayMs: 1, onRetry })
    expect(result).toEqual({ id: 1 })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry.mock.calls[0][0]).toMatchObject({ attempt: 1 })
  })

  it("não faz retry em erro lógico (ex: unique violation)", async () => {
    const logical = Object.assign(new Error("duplicate key"), { code: "23505" })
    const fn = vi.fn().mockRejectedValue(logical)

    await expect(withDbRetry(fn, { initialDelayMs: 1 })).rejects.toBe(logical)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("desiste depois de maxAttempts e propaga o último erro", async () => {
    const transient = Object.assign(new Error("Failed query"), { code: "08006" })
    const fn = vi.fn().mockRejectedValue(transient)

    await expect(
      withDbRetry(fn, { maxAttempts: 3, initialDelayMs: 1 })
    ).rejects.toBe(transient)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("aplica backoff exponencial respeitando maxDelayMs", async () => {
    const transient = Object.assign(new Error("Failed query"), { code: "08006" })
    const fn = vi.fn().mockRejectedValue(transient)
    const onRetry = vi.fn()

    await expect(
      withDbRetry(fn, {
        maxAttempts: 4,
        initialDelayMs: 10,
        backoffFactor: 3,
        maxDelayMs: 50,
        onRetry,
      })
    ).rejects.toBe(transient)

    // 4 tentativas = 3 retries, delays = 10, 30, 50 (clamped pelo maxDelay)
    expect(onRetry.mock.calls.map((c) => c[0].delayMs)).toEqual([10, 30, 50])
  })
})
