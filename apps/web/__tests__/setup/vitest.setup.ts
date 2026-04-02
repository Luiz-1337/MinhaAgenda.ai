import { vi, beforeAll, afterEach, afterAll } from "vitest"

// Mock @repo/db - módulo mais pesado, importado em quase tudo
vi.mock("@repo/db", () => ({
  db: {
    query: {
      salons: { findFirst: vi.fn() },
      profiles: { findFirst: vi.fn() },
      chats: { findFirst: vi.fn() },
      agents: { findFirst: vi.fn() },
      customers: { findFirst: vi.fn() },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  },
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lt: vi.fn(),
  sql: vi.fn(),
  salons: { id: "id" },
  profiles: { id: "id" },
  aiUsageStats: { salonId: "salonId", date: "date", model: "model", credits: "credits" },
  chats: {},
  agents: {},
  customers: {},
  domainServices: {
    createAppointmentService: vi.fn(),
    updateAppointmentService: vi.fn(),
    analyzeMessageRequiresResponse: vi.fn(),
  },
  toBrazilTime: vi.fn((d: Date) => d),
  fromBrazilTime: vi.fn((d: Date) => d),
  getBrazilNow: vi.fn(() => new Date("2026-01-01T12:00:00.000Z")),
  BRAZIL_TIMEZONE: "America/Sao_Paulo",
}))

// Mock logger - silencia logs nos testes
vi.mock("@/lib/infra/logger", () => {
  const noopLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    trace: vi.fn(),
    fatal: vi.fn(),
  }

  return {
    logger: noopLogger,
    createContextLogger: vi.fn(() => noopLogger),
    hashPhone: vi.fn((p: string) => `hashed_${p}`),
    hashUrl: vi.fn((u: string) => `hashed_${u}`),
    sanitizeForLogging: vi.fn((d: Record<string, unknown>) => d),
    formatDuration: vi.fn((ms: number) => `${ms}ms`),
    createRequestContext: vi.fn(() => ({
      requestId: "test-req-id",
      startTime: Date.now(),
    })),
    getDuration: vi.fn(() => 100),
    getReplicaId: vi.fn(() => "test-replica"),
  }
})

// Mock redis
vi.mock("@/lib/infra/redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    pipeline: vi.fn(),
  })),
  redis: vi.fn(),
  createRedisClientForBullMQ: vi.fn(),
  isMessageProcessed: vi.fn().mockResolvedValue(false),
  markMessageProcessed: vi.fn().mockResolvedValue(undefined),
  acquireLock: vi.fn().mockResolvedValue("lock-id"),
  releaseLock: vi.fn().mockResolvedValue(undefined),
  extendLock: vi.fn().mockResolvedValue(true),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 100, remaining: 100, resetIn: 0 }),
  getRateLimitInfo: vi.fn(),
  resetRateLimit: vi.fn(),
  closeRedisConnection: vi.fn(),
  storeLidMapping: vi.fn(),
  resolveLidToPhone: vi.fn(),
  setManualLidMapping: vi.fn(),
  removeLidMapping: vi.fn(),
}))

beforeAll(() => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.clearAllMocks()
})

afterAll(() => {
  vi.restoreAllMocks()
})
