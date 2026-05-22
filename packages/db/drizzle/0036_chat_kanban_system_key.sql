-- Adiciona `system_key` em `chat_kanban_columns` para a IA referenciar colunas
-- por chave semântica estável (`pending` | `in_progress` | `completed` | `attention`)
-- mesmo quando o usuário renomeia as colunas system.
--
-- A tool MCP `setChatKanbanColumn(category)` recebe a chave semântica e o use case
-- resolve via `WHERE salon_id = ? AND system_key = ?` — sobrevive a renames.

ALTER TABLE "chat_kanban_columns"
  ADD COLUMN IF NOT EXISTS "system_key" text;

-- Backfill: as 4 colunas system seedadas em 0035 recebem a chave correspondente
-- ao nome original. Colunas criadas pelo usuário ficam com NULL.
UPDATE "chat_kanban_columns" SET "system_key" = 'pending'
  WHERE "is_system" = true AND "name" = 'Pendentes' AND "system_key" IS NULL;

UPDATE "chat_kanban_columns" SET "system_key" = 'in_progress'
  WHERE "is_system" = true AND "name" = 'Andamento' AND "system_key" IS NULL;

UPDATE "chat_kanban_columns" SET "system_key" = 'completed'
  WHERE "is_system" = true AND "name" = 'Concluídas' AND "system_key" IS NULL;

UPDATE "chat_kanban_columns" SET "system_key" = 'attention'
  WHERE "is_system" = true AND "name" = 'Atenção' AND "system_key" IS NULL;

-- Partial unique: cada salão tem no máximo 1 coluna por system_key.
-- Linhas com system_key NULL (custom) não colidem (NULL não é igual a NULL no Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS "chat_kanban_columns_salon_system_key_idx"
  ON "chat_kanban_columns" ("salon_id", "system_key")
  WHERE "system_key" IS NOT NULL;
