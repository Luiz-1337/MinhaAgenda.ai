CREATE TABLE "system_prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"salon_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_prompt_templates" ADD CONSTRAINT "system_prompt_templates_salon_id_salons_id_fk" FOREIGN KEY ("salon_id") REFERENCES "public"."salons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "system_prompt_templates_salon_idx" ON "system_prompt_templates" USING btree ("salon_id");--> statement-breakpoint
CREATE INDEX "system_prompt_templates_active_idx" ON "system_prompt_templates" USING btree ("is_active");