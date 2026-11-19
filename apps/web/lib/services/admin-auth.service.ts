import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db, profiles, eq } from "@repo/db";
import { createClient } from "@/lib/supabase/server";

/**
 * Autenticação do admin do produto — FONTE ÚNICA.
 *
 * Não existe middleware/proxy em apps/web: cada Server Action e cada rota em
 * `app/api/admin/**` é o ÚNICO ponto de controle. Por isso:
 *
 *   - Server Actions do admin chamam `requireAdmin()` (sessão + `system_role`).
 *   - Rotas em `app/api/admin/**` chamam `requireAdminRequest(headers)`, que
 *     aceita a sessão de admin (telas do painel) OU o header `x-admin-key`
 *     (curl/scripts de operação). O teste `admin-routes-authz.test.ts` falha se
 *     alguma rota nova esquecer essa chamada.
 */

/**
 * Quem executou a ação. `id` é nulo quando a chamada veio pela chave de API
 * (não há usuário por trás) — a auditoria grava `admin_id` nulo nesse caso.
 */
export interface AdminContext {
  id: string | null;
  email: string;
}

/** Rótulo gravado em `admin_audit_logs.admin_email` para chamadas via chave. */
export const ADMIN_API_KEY_ACTOR = "api-key (x-admin-key)";

/**
 * Compara um segredo recebido com o esperado em tempo constante.
 * Os dois lados passam por SHA-256 antes do `timingSafeEqual`, que exige
 * buffers de mesmo tamanho — assim o tamanho do segredo também não vaza.
 */
export function isValidSecret(
  received: string | null | undefined,
  expected: string | null | undefined
): boolean {
  if (!received || !expected) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Garante que a requisição vem de um admin autenticado pela sessão.
 * Retorna o contexto do admin ou um erro padronizado.
 */
export async function requireAdmin(): Promise<
  { admin: AdminContext & { id: string } } | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Não autenticado" };
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, user.id),
    columns: { systemRole: true, email: true },
  });

  if (profile?.systemRole !== "admin") {
    return { error: "Acesso negado" };
  }

  return { admin: { id: user.id, email: profile.email ?? user.email ?? "" } };
}

/**
 * Guard das rotas em `app/api/admin/**`. Aceita, nesta ordem:
 *   1. header `x-admin-key` igual a `ADMIN_API_KEY` (comparação em tempo constante);
 *   2. sessão de um usuário com `system_role = 'admin'`.
 * Qualquer outra coisa recebe 401/403.
 */
export async function requireAdminRequest(
  headers: Headers
): Promise<{ admin: AdminContext } | { response: NextResponse }> {
  const key = headers.get("x-admin-key");
  if (key) {
    if (isValidSecret(key, process.env.ADMIN_API_KEY)) {
      return { admin: { id: null, email: ADMIN_API_KEY_ACTOR } };
    }
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const auth = await requireAdmin();
  if ("error" in auth) {
    const status = auth.error === "Não autenticado" ? 401 : 403;
    return { response: NextResponse.json({ error: auth.error }, { status }) };
  }
  return { admin: auth.admin };
}

/**
 * Validates cron secret from request headers.
 * Compatible with Vercel Cron's `CRON_SECRET` header.
 */
export function requireCronAuth(headers: Headers): NextResponse | null {
  const secret = headers.get("authorization")?.replace("Bearer ", "");
  const expected = process.env.CRON_SECRET;

  if (!expected) {
    return NextResponse.json(
      { error: "Cron secret not configured" },
      { status: 503 }
    );
  }

  if (!isValidSecret(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
