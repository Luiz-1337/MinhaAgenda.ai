-- Migration: Add unique constraint for chats table
-- Required for ON CONFLICT (salon_id, client_phone) DO NOTHING to work

-- Create unique index on chats(salon_id, client_phone)
CREATE UNIQUE INDEX IF NOT EXISTS chats_salon_phone_unique ON chats (salon_id, client_phone);
