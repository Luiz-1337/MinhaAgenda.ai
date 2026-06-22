"use client"

import { useEffect } from "react"

/**
 * Error boundary global (raiz). Captura falhas que escapam do RootLayout.
 * Precisa renderizar seu próprio <html>/<body> e não pode depender do tema/CSS
 * do layout (que pode ter falhado), por isso usa estilos inline.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[global-error-boundary]", error)
  }, [error])

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0f1115",
          color: "#e6e9ef",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            border: "1px solid #2a2f3a",
            borderRadius: 12,
            padding: 32,
            background: "#171a21",
          }}
        >
          <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>
            minha<span style={{ color: "#4f9fff" }}>agenda</span>.ai
          </h2>
          <p style={{ fontSize: 14, color: "#9aa3b2", margin: "0 0 20px" }}>
            Ocorreu um erro inesperado ao carregar o aplicativo. Tente novamente.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              border: "none",
              cursor: "pointer",
              padding: "10px 18px",
              borderRadius: 8,
              background: "#2873bf",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            Tentar de novo
          </button>
          {error.digest && (
            <p
              style={{
                marginTop: 16,
                fontSize: 11,
                color: "#6b7280",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
