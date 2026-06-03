-- Tabela de auditoria das ações administrativas do painel /z_admin_minhaagendaai.
-- Registra criar/editar/excluir usuário, troca de senha/email, ajuste de
-- créditos (limite, extras, reset de consumo) e ações em massa.
-- admin_email é snapshot: preservado mesmo se o admin for removido (FK SET NULL).

CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "admin_id" uuid,
  "admin_email" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" uuid,
  "target_label" text,
  "details" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_admin_id_profiles_id_fk"
    FOREIGN KEY ("admin_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx" ON "admin_audit_logs" ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_idx" ON "admin_audit_logs" ("target_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx" ON "admin_audit_logs" ("action");
