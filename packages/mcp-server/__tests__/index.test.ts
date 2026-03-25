import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const hasMock = vi.fn()
const registerProvidersMock = vi.fn()
const registerAllToolsMock = vi.fn()

const containerMock = {
  has: hasMock,
}

function makeTool(name: string) {
  return {
    description: name,
    inputSchema: z.object({}),
    execute: vi.fn(),
  }
}

vi.mock("../src/container", () => ({
  container: containerMock,
  registerProviders: registerProvidersMock,
  TOKENS: {
    AppointmentRepository: "IAppointmentRepository",
  },
  Container: class {},
}))

vi.mock("../src/presentation/tools", () => ({
  registerAllTools: registerAllToolsMock,
  createAppointmentTools: vi.fn(),
  createAvailabilityTools: vi.fn(),
  createCustomerTools: vi.fn(),
  createCatalogTools: vi.fn(),
  createSalonTools: vi.fn(),
}))

describe("src/index createMCPTools", () => {
  beforeEach(() => {
    hasMock.mockReset()
    registerProvidersMock.mockReset()
    registerAllToolsMock.mockReset()
  })

  it("registra providers quando token base não está registrado", async () => {
    const tools = {
      checkAvailability: makeTool("checkAvailability"),
    }

    hasMock.mockReturnValue(false)
    registerAllToolsMock.mockReturnValue(tools)

    const { createMCPTools } = await import("../src/index")
    const result = await createMCPTools("salon-1", "5511999999999")

    expect(hasMock).toHaveBeenCalledWith("IAppointmentRepository")
    expect(registerProvidersMock).toHaveBeenCalledWith(containerMock)
    expect(registerAllToolsMock).toHaveBeenCalledWith(containerMock, "salon-1", "5511999999999")
    expect(result).toBe(tools)
  })

  it("não registra providers novamente quando token já existe", async () => {
    const tools = {
      getServices: makeTool("getServices"),
    }

    hasMock.mockReturnValue(true)
    registerAllToolsMock.mockReturnValue(tools)

    const { createMCPTools } = await import("../src/index")
    const result = await createMCPTools("salon-2", "5511888888888")

    expect(hasMock).toHaveBeenCalledWith("IAppointmentRepository")
    expect(registerProvidersMock).not.toHaveBeenCalled()
    expect(registerAllToolsMock).toHaveBeenCalledWith(containerMock, "salon-2", "5511888888888")
    expect(result).toBe(tools)
  })
})
