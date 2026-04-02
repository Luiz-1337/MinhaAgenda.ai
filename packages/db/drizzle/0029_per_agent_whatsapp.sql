-- Per-agent WhatsApp: Evolution fields on agents table + agentId on chats

ALTER TABLE "agents" ADD COLUMN "evolution_instance_name" text;
ALTER TABLE "agents" ADD COLUMN "evolution_instance_token" text;
ALTER TABLE "agents" ADD COLUMN "evolution_connection_status" text;
ALTER TABLE "agents" ADD COLUMN "evolution_connected_at" timestamp;

CREATE INDEX IF NOT EXISTS "agents_evolution_instance_idx" ON "agents" USING btree ("evolution_instance_name");

ALTER TABLE "chats" ADD COLUMN "agent_id" uuid;
ALTER TABLE "chats" ADD CONSTRAINT "chats_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "chats_agent_idx" ON "chats" USING btree ("agent_id");
