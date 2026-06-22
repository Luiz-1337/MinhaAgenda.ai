-- Feature flag por salão para auto-classificação de chats no kanban pela IA.
-- Quando true, a tool MCP `setChatKanbanColumn` está disponível e a IA pode
-- mover chats entre colunas durante a conversa. Default false até o usuário
-- ativar manualmente — evita surpresas em salões existentes.

ALTER TABLE "salons"
  ADD COLUMN IF NOT EXISTS "ai_kanban_classification_enabled" boolean DEFAULT false NOT NULL;
