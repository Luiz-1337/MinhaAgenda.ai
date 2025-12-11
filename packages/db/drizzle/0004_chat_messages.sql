-- Create chat_messages table for persistent chat history
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "salon_id" uuid NOT NULL,
  "client_id" uuid,
  "role" text NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "chat_messages"
  ADD CONSTRAINT IF NOT EXISTS "chat_messages_salon_id_salons_id_fk"
  FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT IF NOT EXISTS "chat_messages_client_id_profiles_id_fk"
  FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "chat_messages_salon_client_idx" ON "chat_messages" USING btree ("salon_id", "client_id");
CREATE INDEX IF NOT EXISTS "chat_messages_salon_created_idx" ON "chat_messages" USING btree ("salon_id", "created_at");

