-- Kanban board for WhatsApp conversations.
-- Allows operators to organize chats in user-customizable columns (Pendentes,
-- Andamento, Concluídas, Atenção by default). Each salon owns its own columns;
-- a chat belongs to at most one column at a time.
--
-- Design notes:
--   - chat_kanban_columns.is_default marks the fallback column where chats
--     without a column appear visually. Exactly one default per salon (partial
--     unique index below).
--   - chats.kanban_column_id is nullable; legacy chats stay null and fall back
--     to the default column on the read side. No backfill needed.
--   - chats.kanban_position uses numeric(20,10) for fractional indexing
--     (insert between two siblings without renumbering others on drag-and-drop).

CREATE TABLE IF NOT EXISTS "chat_kanban_columns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid NOT NULL REFERENCES "salons"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "color" text DEFAULT '#94a3b8' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Hot path: list columns of a salon ordered horizontally on the board
CREATE INDEX IF NOT EXISTS "chat_kanban_columns_salon_idx"
  ON "chat_kanban_columns" ("salon_id", "position");

-- Exactly one default column per salon
CREATE UNIQUE INDEX IF NOT EXISTS "chat_kanban_columns_salon_default"
  ON "chat_kanban_columns" ("salon_id")
  WHERE "is_default" = true;

-- chats: column assignment + ordering within column
ALTER TABLE "chats"
  ADD COLUMN IF NOT EXISTS "kanban_column_id" uuid
    REFERENCES "chat_kanban_columns"("id") ON DELETE SET NULL;

ALTER TABLE "chats"
  ADD COLUMN IF NOT EXISTS "kanban_position" numeric(20, 10);

-- Hot path: board read groups chats by (salon_id, kanban_column_id)
CREATE INDEX IF NOT EXISTS "chats_kanban_idx"
  ON "chats" ("salon_id", "kanban_column_id");

-- One-off backfill: seed the 4 default columns for every existing salon
-- (new salons will be seeded via salon.service.ts during creation)
DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN
    SELECT id FROM salons sa
    WHERE NOT EXISTS (
      SELECT 1 FROM chat_kanban_columns WHERE salon_id = sa.id
    )
  LOOP
    -- system_key adicionado retroativamente em 0036_chat_kanban_system_key.sql
    -- (deixado fora aqui porque a coluna ainda não existe nesta migration)
    INSERT INTO chat_kanban_columns (salon_id, name, color, position, is_default, is_system) VALUES
      (s.id, 'Pendentes',  '#f59e0b', 0, true,  true),
      (s.id, 'Andamento',  '#3b82f6', 1, false, true),
      (s.id, 'Concluídas', '#10b981', 2, false, true),
      (s.id, 'Atenção',    '#ef4444', 3, false, true);
  END LOOP;
END $$;
