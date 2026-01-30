-- Fix appointments.client_id foreign key to reference customers instead of profiles
-- This is the correct design since customers come from WhatsApp messages, not user profiles
-- V2: Added checks to prevent errors if constraints already exist

-- Drop the old foreign key constraint (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_profiles_id_fk'
    AND table_name = 'appointments'
  ) THEN
    ALTER TABLE appointments DROP CONSTRAINT appointments_client_id_profiles_id_fk;
    RAISE NOTICE 'Dropped old constraint: appointments_client_id_profiles_id_fk';
  ELSE
    RAISE NOTICE 'Old constraint appointments_client_id_profiles_id_fk does not exist, skipping';
  END IF;
END $$;

-- Add the correct foreign key constraint to customers table (if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'appointments_client_id_customers_id_fk'
    AND table_name = 'appointments'
  ) THEN
    ALTER TABLE appointments
    ADD CONSTRAINT appointments_client_id_customers_id_fk
    FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE CASCADE;
    RAISE NOTICE 'Created new constraint: appointments_client_id_customers_id_fk';
  ELSE
    RAISE NOTICE 'Constraint appointments_client_id_customers_id_fk already exists, skipping';
  END IF;
END $$;

-- Update RLS policy for appointments to work with customers instead of profiles
-- Note: customers don't have auth.uid(), so we only check salon ownership
DROP POLICY IF EXISTS "Users can create appointments" ON appointments;

CREATE POLICY "Users can create appointments" ON appointments
  FOR INSERT WITH CHECK (
    -- Salon owners can create appointments
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    -- Active professionals can create appointments for their salon
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can update relevant appointments" ON appointments;

CREATE POLICY "Users can update relevant appointments" ON appointments
  FOR UPDATE USING (
    -- Salon owners can update appointments
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    -- Active professionals can update appointments for their salon
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

DROP POLICY IF EXISTS "Users can view relevant appointments" ON appointments;

CREATE POLICY "Users can view relevant appointments" ON appointments
  FOR SELECT USING (
    -- Salon owners can view appointments
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    -- Active professionals can view appointments for their salon
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✓ Migration 012_v2 completed successfully';
  RAISE NOTICE '✓ FK constraint verified/created';
  RAISE NOTICE '✓ RLS policies updated';
END $$;
