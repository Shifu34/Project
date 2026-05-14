-- Migration 006: Lab staff role, profiles, slots, and appointments

-- 1. Add lab_staff role if it doesn't exist
INSERT INTO roles (name, permissions)
SELECT 'lab_staff', '["lab:read","lab:write"]'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = 'lab_staff');

-- 2. Lab staff profiles
CREATE TABLE IF NOT EXISTS lab_staff_profiles (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  phone            VARCHAR(50),
  email            VARCHAR(255),
  organization_id  INTEGER REFERENCES organizations(id) ON DELETE SET NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id)
);

-- 3. Lab availability slots (schedule set by lab staff)
CREATE TABLE IF NOT EXISTS lab_slots (
  id               SERIAL PRIMARY KEY,
  lab_staff_id     INTEGER NOT NULL REFERENCES lab_staff_profiles(id) ON DELETE CASCADE,
  test_id          INTEGER REFERENCES lab_test_catalog(id) ON DELETE SET NULL,  -- NULL = slot applies to any test
  slot_date        DATE NOT NULL,
  slot_time        TIME NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 15,
  max_bookings     INTEGER NOT NULL DEFAULT 1,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Lab appointments (patients booking a slot)
CREATE TABLE IF NOT EXISTS lab_appointments (
  id           SERIAL PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  lab_slot_id  INTEGER NOT NULL REFERENCES lab_slots(id) ON DELETE CASCADE,
  lab_test_id  INTEGER REFERENCES lab_test_catalog(id) ON DELETE SET NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','confirmed','completed','cancelled')),
  notes        TEXT,
  booked_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lab_slots_staff      ON lab_slots (lab_staff_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_lab_slots_date       ON lab_slots (slot_date);
CREATE INDEX IF NOT EXISTS idx_lab_appt_patient     ON lab_appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_lab_appt_slot        ON lab_appointments (lab_slot_id);
CREATE INDEX IF NOT EXISTS idx_lab_staff_user       ON lab_staff_profiles (user_id);
