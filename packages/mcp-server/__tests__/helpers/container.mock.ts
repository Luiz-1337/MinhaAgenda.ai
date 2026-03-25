import { vi } from "vitest"

type TokenMap = Record<string, unknown>

export interface ContainerMockController {
  container: {
    resolve: <T>(token: string) => T
  }
  resolveSpy: ReturnType<typeof vi.fn>
  resolveCalls: string[]
  setToken: (token: string, value: unknown) => void
  removeToken: (token: string) => void
}

export function createContainerMock(initialTokens: TokenMap = {}): ContainerMockController {
  const tokenMap = new Map<string, unknown>(Object.entries(initialTokens))
  const resolveCalls: string[] = []

  const resolveSpy = vi.fn(<T>(token: string): T => {
    resolveCalls.push(token)

    if (!tokenMap.has(token)) {
      throw new Error(`Dependência não registrada: ${token}`)
    }

    return tokenMap.get(token) as T
  })

  return {
    container: {
      resolve: resolveSpy,
    },
    resolveSpy,
    resolveCalls,
    setToken: (token, value) => {
      tokenMap.set(token, value)
    },
    removeToken: (token) => {
      tokenMap.delete(token)
    },
  }
}
