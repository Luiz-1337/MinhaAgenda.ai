import { beforeEach, describe, expect, it, vi } from "vitest"

const registerProvidersMock = vi.fn()
const clearSingletonsMock = vi.fn()
const registerAllToolsMock = vi.fn()
const transportCtorMock = vi.fn()

const ListToolsRequestSchemaMock = { type: "list-tools" }
const CallToolRequestSchemaMock = { type: "call-tool" }

type Handler = (request?: any) => Promise<any>

class ServerMock {
  static instances: ServerMock[] = []

  handlers = new Map<any, Handler>()
  onerror?: (error: Error) => void

  constructor(
    public metadata: { name: string; version: string },
    public options: { capabilities: { tools: object } }
  ) {
    ServerMock.instances.push(this)
  }

  setRequestHandler(schema: unknown, handler: Handler) {
    this.handlers.set(schema, handler)
  }

  connect = vi.fn(async () => undefined)
}

class StdioServerTransportMock {
  constructor() {
    transportCtorMock()
  }
}

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: ServerMock,
}))

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: StdioServerTransportMock,
}))

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  ListToolsRequestSchema: ListToolsRequestSchemaMock,
  CallToolRequestSchema: CallToolRequestSchemaMock,
}))

vi.mock("../../src/container", () => ({
  container: {
    clearSingletons: clearSingletonsMock,
  },
  registerProviders: registerProvidersMock,
}))

vi.mock("../../src/presentation/tools", () => ({
  registerAllTools: registerAllToolsMock,
}))

describe("presentation/mcp-server", () => {
  beforeEach(() => {
    ServerMock.instances = []
    registerProvidersMock.mockReset()
    clearSingletonsMock.mockReset()
    registerAllToolsMock.mockReset()
    transportCtorMock.mockReset()
  })

  it("start registra providers/tools e lista tools", async () => {
    registerAllToolsMock.mockReturnValue({
      checkAvailability: {
        description: "Verifica disponibilidade",
        execute: vi.fn(),
      },
      getServices: {
        description: "Lista serviços",
        execute: vi.fn(),
      },
    })

    const { start } = await import("../../src/presentation/mcp-server")
    await start("salon-1", "5511999999999")

    expect(registerProvidersMock).toHaveBeenCalledTimes(1)
    expect(registerAllToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({ clearSingletons: clearSingletonsMock }),
      "salon-1",
      "5511999999999"
    )
    expect(transportCtorMock).toHaveBeenCalledTimes(1)

    const server = ServerMock.instances[0]
    const listHandler = server.handlers.get(ListToolsRequestSchemaMock)
    expect(listHandler).toBeTypeOf("function")

    const response = await listHandler?.()
    expect(response).toEqual({
      tools: [
        {
          name: "checkAvailability",
          description: "Verifica disponibilidade",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "getServices",
          description: "Lista serviços",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    })
  })

  it("callTool executa tool existente e serializa objeto/string", async () => {
    const executeObject = vi.fn().mockResolvedValue({ ok: true })
    const executeString = vi.fn().mockResolvedValue("resultado textual")

    registerAllToolsMock.mockReturnValue({
      checkAvailability: {
        description: "Verifica",
        execute: executeObject,
      },
      getSalonInfo: {
        description: "Salão",
        execute: executeString,
      },
    })

    const { start } = await import("../../src/presentation/mcp-server")
    await start("salon-1", "5511999999999")

    const server = ServerMock.instances[0]
    const callHandler = server.handlers.get(CallToolRequestSchemaMock)
    expect(callHandler).toBeTypeOf("function")

    const objectResponse = await callHandler?.({
      params: {
        name: "checkAvailability",
        arguments: { date: "2026-04-10T09:30:00-03:00" },
      },
    })
    const stringResponse = await callHandler?.({
      params: {
        name: "getSalonInfo",
        arguments: {},
      },
    })

    expect(executeObject).toHaveBeenCalledWith({ date: "2026-04-10T09:30:00-03:00" })
    expect(objectResponse).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true }),
        },
      ],
    })

    expect(executeString).toHaveBeenCalledWith({})
    expect(stringResponse).toEqual({
      content: [
        {
          type: "text",
          text: "resultado textual",
        },
      ],
    })
  })

  it("callTool retorna erro para tool inexistente e exceção em execute", async () => {
    const executeThrow = vi.fn().mockRejectedValue(new Error("Falha ao executar tool"))

    registerAllToolsMock.mockReturnValue({
      checkAvailability: {
        description: "Verifica",
        execute: executeThrow,
      },
    })

    const { start } = await import("../../src/presentation/mcp-server")
    await start("salon-1", "5511999999999")

    const server = ServerMock.instances[0]
    const callHandler = server.handlers.get(CallToolRequestSchemaMock)

    const missingToolResponse = await callHandler?.({
      params: {
        name: "toolInexistente",
        arguments: {},
      },
    })

    const throwResponse = await callHandler?.({
      params: {
        name: "checkAvailability",
        arguments: { date: "2026-04-10" },
      },
    })

    expect(missingToolResponse).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: true, message: "Tool não encontrada: toolInexistente" }),
        },
      ],
    })

    expect(throwResponse).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: true, message: "Falha ao executar tool" }),
        },
      ],
    })
  })

  it("stop limpa singletons do container", async () => {
    const { stop } = await import("../../src/presentation/mcp-server")
    await stop()

    expect(clearSingletonsMock).toHaveBeenCalledTimes(1)
  })
})
