import { afterAll, afterEach, beforeAll, beforeEach, expect, vi } from "vitest"

const TRACE_ENABLED = process.env.TEST_TRACE === "1"
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
}

let currentTestStart = 0

function formatLogArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg
      try {
        return JSON.stringify(arg)
      } catch {
        return String(arg)
      }
    })
    .join(" ")
}

vi.mock("@repo/db", () => {
  const toBrazilTime = vi.fn((value: Date) => value)
  const fromBrazilTime = vi.fn((value: Date) => value)
  const getBrazilNow = vi.fn(() => new Date("2026-01-01T12:00:00.000Z"))

  return {
    BRAZIL_TIMEZONE: "America/Sao_Paulo",
    toBrazilTime,
    fromBrazilTime,
    getBrazilNow,
    db: {
      query: {},
    },
    domainServices: {
      createAppointmentService: vi.fn(),
      updateAppointmentService: vi.fn(),
    },
  }
})

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    if (!TRACE_ENABLED) return
    originalConsole.log(`[APP LOG] ${formatLogArgs(args)}`)
  })
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
    if (!TRACE_ENABLED) return
    originalConsole.info(`[APP INFO] ${formatLogArgs(args)}`)
  })
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    if (!TRACE_ENABLED) return
    originalConsole.warn(`[APP WARN] ${formatLogArgs(args)}`)
  })
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (!TRACE_ENABLED) return
    originalConsole.error(`[APP ERROR] ${formatLogArgs(args)}`)
  })
})

beforeEach(() => {
  currentTestStart = Date.now()
  if (!TRACE_ENABLED) return
  const testName = expect.getState().currentTestName ?? "unknown test"
  originalConsole.info(`\n[TEST START] ${testName}`)
})

afterEach(() => {
  if (TRACE_ENABLED) {
    const durationMs = Date.now() - currentTestStart
    const testName = expect.getState().currentTestName ?? "unknown test"
    originalConsole.info(`[TEST END] ${testName} (${durationMs}ms)`)
  }
  vi.clearAllMocks()
})

afterAll(() => {
  vi.restoreAllMocks()
})
