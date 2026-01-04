-- Adicionar Foreign Key de salon_id em profiles se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_salon_id_salons_id_fk'
  ) THEN
    ALTER TABLE "public"."profiles" 
    ADD CONSTRAINT "profiles_salon_id_salons_id_fk" 
    FOREIGN KEY ("salon_id") 
    REFERENCES "public"."salons"("id") 
    ON DELETE SET NULL;
  END IF;
END $$;




