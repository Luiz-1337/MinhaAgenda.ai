import type { Metadata } from "next"
import { getPublicDocumentService } from "@repo/db"
import { SignForm } from "./sign-form"

/**
 * Página pública de assinatura de documento (docs/ROADMAP.md, fase 7, fatia 7e).
 *
 * Página SEM login: quem abre é o cliente do salão, pelo link que recebeu. A única
 * credencial é o token da URL. Mostra o nome do salão e o documento; depois de
 * assinado, mostra também a assinatura — é a via do cliente.
 */

export const metadata: Metadata = {
  title: "Assinatura de documento",
  // O link é pessoal: não é para buscador.
  robots: { index: false, follow: false },
}

// Cada documento é de uma pessoa e muda quando ela assina: nunca em cache.
export const dynamic = "force-dynamic"

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export default async function PublicDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const document = await getPublicDocumentService(token, new Date())

  return (
    <main className="min-h-screen bg-background flex items-start justify-center p-4 sm:py-10">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl p-6 space-y-5">
        {!document ? (
          <div className="space-y-2 text-center">
            <h1 className="text-lg font-bold text-foreground">Link inválido</h1>
            <p className="text-sm text-muted-foreground">
              Este link não existe ou não vale mais. Peça um novo link ao salão.
            </p>
          </div>
        ) : (
          <>
            <header className="space-y-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {document.salonName}
              </p>
              <h1 className="text-xl font-bold text-foreground">{document.title}</h1>
            </header>

            <p className="text-sm text-foreground whitespace-pre-wrap break-words">{document.body}</p>

            <div className="border-t border-border pt-5">
              {document.status === "signed" ? (
                <div className="space-y-2" role="status">
                  {document.signatureImage && (
                    // Data URL de PNG, validado no servidor ao assinar.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={document.signatureImage}
                      alt={`Assinatura de ${document.signerName ?? "cliente"}`}
                      className="h-28 w-full max-w-sm object-contain bg-white border border-border rounded-md"
                    />
                  )}
                  <p className="text-sm font-semibold text-foreground">{document.signerName}</p>
                  <p className="text-xs text-muted-foreground">
                    Documento assinado em{" "}
                    {document.signedAt ? dateTimeFormat.format(new Date(document.signedAt)) : "—"}. Guarde este link:
                    ele é a sua via.
                  </p>
                </div>
              ) : document.status === "expired" ? (
                <p className="text-sm text-muted-foreground text-center" role="status">
                  Este link venceu sem assinatura. Peça um novo link ao salão.
                </p>
              ) : (
                <SignForm token={token} />
              )}
            </div>

            <footer className="pt-3 border-t border-border text-[11px] text-muted-foreground break-all">
              SHA-256 do texto: {document.bodyHash}
            </footer>
          </>
        )}
      </div>
    </main>
  )
}
