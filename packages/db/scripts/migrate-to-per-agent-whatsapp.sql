-- Migration: Copy salon-level Evolution fields to active agents for PRO/Enterprise salons
-- This is a data migration to be run ONCE after the schema migration (0029).
-- SOLO salons don't need migration - their salon-level fields continue working.

-- Step 1: Copy Evolution instance data from salons to the active agent of each salon
-- that has an Evolution instance configured.
-- This preserves the existing instance name (salon-{salonId}) on the agent record.
UPDATE agents a
SET
  evolution_instance_name = s.evolution_instance_name,
  evolution_instance_token = s.evolution_instance_token,
  evolution_connection_status = s.evolution_connection_status,
  evolution_connected_at = s.evolution_connected_at,
  updated_at = NOW()
FROM salons s
JOIN profiles p ON p.id = s.owner_id
WHERE a.salon_id = s.id
  AND a.is_active = true
  AND s.evolution_instance_name IS NOT NULL
  AND p.tier IN ('PRO', 'ENTERPRISE');

-- Step 2: Backfill chats.agent_id for existing chats
-- Link each chat to the currently active agent of its salon
UPDATE chats c
SET agent_id = (
  SELECT a.id FROM agents a
  WHERE a.salon_id = c.salon_id AND a.is_active = true
  LIMIT 1
)
WHERE c.agent_id IS NULL;

-- Step 3: Verify migration
-- SELECT count(*) as agents_with_instance FROM agents WHERE evolution_instance_name IS NOT NULL;
-- SELECT count(*) as chats_with_agent FROM chats WHERE agent_id IS NOT NULL;
-- SELECT count(*) as chats_without_agent FROM chats WHERE agent_id IS NULL;
