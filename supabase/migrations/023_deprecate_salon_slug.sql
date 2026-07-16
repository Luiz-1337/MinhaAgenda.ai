-- 023_deprecate_salon_slug.sql — STAGED: aplicar após o deploy do schema.ts + código.
--
-- Soft-deprecate de salons.slug. O app deixa de GERAR e de LER slug (removido de
-- getUserSalons/getCurrentSalon, tipos SalonListItem/SalonDetails, createSalonSchema e
-- dos inserts de signup/onboarding/createSalonWithOwner). Novos salões passam a ter
-- slug NULL.
--
-- Esta migration só torna a coluna NULLABLE (para permitir slug NULL). A coluna e o
-- índice UNIQUE são MANTIDOS de propósito: o mcp-server ainda lê/gera slug e ~7 scripts
-- de seed usam slug como chave de idempotência (ON CONFLICT/SELECT). Nulls não conflitam
-- no UNIQUE. O drop físico da coluna pode ser feito depois, quando MCP e seeds forem
-- migrados. Não-destrutiva. Idempotente.

ALTER TABLE public.salons ALTER COLUMN slug DROP NOT NULL;

DO $$
BEGIN
  RAISE NOTICE '023 OK: salons.slug agora e NULLABLE (soft-deprecate; coluna/UNIQUE mantidos p/ MCP e seeds)';
END $$;
