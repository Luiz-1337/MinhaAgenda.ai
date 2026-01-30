-- Fix appointments.client_id foreign key to reference customers instead of profiles
-- This is the correct design since customers come from WhatsApp messages, not user profiles

-- Drop the old foreign key constraint
ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS appointments_client_id_profiles_id_fk;

-- Add the correct foreign key constraint to customers table
ALTER TABLE appointments
ADD CONSTRAINT appointments_client_id_customers_id_fk
FOREIGN KEY (client_id) REFERENCES customers(id) ON DELETE CASCADE;

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
