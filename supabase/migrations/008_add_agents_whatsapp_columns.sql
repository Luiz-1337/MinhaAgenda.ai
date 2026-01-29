-- Migration: Adicionar colunas de WhatsApp na tabela agents
-- Essas colunas permitem gerenciar a integração do agente com WhatsApp/Twilio

-- Adicionar colunas de WhatsApp na tabela agents
ALTER TABLE agents
ADD COLUMN IF NOT EXISTS whatsapp_status TEXT,
ADD COLUMN IF NOT EXISTS twilio_sender_id TEXT,
ADD COLUMN IF NOT EXISTS whatsapp_connected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ;

-- Comentários para documentação
COMMENT ON COLUMN agents.whatsapp_status IS 'Status da verificação: pending_verification, verifying, verified, failed';
COMMENT ON COLUMN agents.twilio_sender_id IS 'ID do sender configurado no Twilio';
COMMENT ON COLUMN agents.whatsapp_connected_at IS 'Data/hora quando o WhatsApp foi conectado';
COMMENT ON COLUMN agents.whatsapp_verified_at IS 'Data/hora quando o WhatsApp foi verificado';
