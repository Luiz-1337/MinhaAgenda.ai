-- Exibir mídia do WhatsApp (foto/áudio do cliente) no chat do painel.
-- Rodar UMA VEZ no banco do projeto MinhaAgenda.AI (ref: egrfxtrkcasiuypkxilr),
-- via Supabase SQL Editor, MCP (apply_migration) ou psql.
--
-- Seguro/aditivo: `ADD COLUMN` nullable em Postgres é metadata-only (instantâneo),
-- sem rewrite da tabela messages.

-- 1) Colunas de mídia na tabela messages
alter table messages
  add column if not exists media_type text,   -- 'image' | 'audio' | 'video' | 'document'
  add column if not exists media_path text;   -- caminho no bucket privado 'whatsapp-media'

-- 2) Bucket PRIVADO de Storage para a mídia (leitura só via URL assinada — é PII)
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;
