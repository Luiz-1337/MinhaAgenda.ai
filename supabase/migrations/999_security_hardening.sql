-- Enable RLS on sensitive tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE salon_customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PROFILES
-- ============================================================
-- Users can view and update their own profile
CREATE POLICY "Users can view their own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- SALONS
-- ============================================================
-- Public read access allows listing salons for booking
CREATE POLICY "Salons are viewable by everyone" ON salons
  FOR SELECT USING (true);

-- Only owners can insert/update their salon
CREATE POLICY "Owners can insert their own salon" ON salons
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their own salon" ON salons
  FOR UPDATE USING (auth.uid() = owner_id);

-- ============================================================
-- SERVICES
-- ============================================================
-- Public read access for booking
CREATE POLICY "Services are viewable by everyone" ON services
  FOR SELECT USING (true);

-- Only salon owners can manage services
CREATE POLICY "Salon owners can insert services" ON services
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = services.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Salon owners can update services" ON services
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = services.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Salon owners can delete services" ON services
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = services.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

-- ============================================================
-- PROFESSIONALS
-- ============================================================
-- Public read access for booking
CREATE POLICY "Professionals are viewable by everyone" ON professionals
  FOR SELECT USING (true);

-- Only salon owners can manage professionals
CREATE POLICY "Salon owners can manage professionals" ON professionals
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = professionals.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

-- ============================================================
-- APPOINTMENTS
-- ============================================================
-- View: Client (own), Owner (salon's), Professional (assigned)
CREATE POLICY "Users can view relevant appointments" ON appointments
  FOR SELECT USING (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    ) OR
    EXISTS (
      SELECT 1 FROM professionals
      WHERE professionals.id = appointments.professional_id
      AND professionals.user_id = auth.uid()
    )
  );

-- Insert: Client (for self) or Owner (for salon)
CREATE POLICY "Users can create appointments" ON appointments
  FOR INSERT WITH CHECK (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

-- Update: Client (own) or Owner (salon)
CREATE POLICY "Users can update relevant appointments" ON appointments
  FOR UPDATE USING (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = appointments.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

-- ============================================================
-- CUSTOMERS (CRM)
-- ============================================================
-- Only salon owners can view/manage their customer list
CREATE POLICY "Salon owners can manage customers" ON customers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = customers.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Salon owners can manage salon_customers" ON salon_customers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = salon_customers.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

-- ============================================================
-- CHATS & MESSAGES
-- ============================================================
-- Salon owners can view chats for their salon
CREATE POLICY "Salon owners can manage chats" ON chats
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = chats.salon_id
      AND salons.owner_id = auth.uid()
    )
  );

-- Messages linked to chats
CREATE POLICY "Salon owners can manage messages" ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM chats
      JOIN salons ON chats.salon_id = salons.id
      WHERE chats.id = messages.chat_id
      AND salons.owner_id = auth.uid()
    )
  );

-- Chat Messages (direct link)
CREATE POLICY "Users can view/manage chat messages" ON chat_messages
  FOR ALL USING (
    auth.uid() = client_id OR
    EXISTS (
      SELECT 1 FROM salons
      WHERE salons.id = chat_messages.salon_id
      AND salons.owner_id = auth.uid()
    )
  );


