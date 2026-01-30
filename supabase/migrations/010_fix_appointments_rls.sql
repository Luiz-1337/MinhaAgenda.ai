-- Fix RLS policy for appointments table to allow professionals to create appointments
-- This resolves the issue where salon owners (who are also professionals) cannot create
-- appointments for clients due to overly restrictive RLS policy

-- Drop the existing policy
DROP POLICY IF EXISTS "Users can create appointments" ON appointments;

-- Create updated policy that allows:
-- 1. Clients to create their own appointments
-- 2. Salon owners to create appointments for their salon
-- 3. Active professionals to create appointments for their salon (NEW)
CREATE POLICY "Users can create appointments" ON appointments
  FOR INSERT WITH CHECK (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );

-- Also update the UPDATE policy to match
DROP POLICY IF EXISTS "Users can update relevant appointments" ON appointments;

CREATE POLICY "Users can update relevant appointments" ON appointments
  FOR UPDATE USING (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.salon_id = appointments.salon_id
      AND professionals.user_id = auth.uid()
      AND professionals.is_active = true
    )
  );
