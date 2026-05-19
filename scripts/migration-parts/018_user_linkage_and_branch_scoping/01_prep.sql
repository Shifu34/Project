-- Migration 018 (part 1/6): prep (sections 0-6)

-- Migration 018: User-based linkage + branch-level scoping

-- -----------------------------------------------------------------------------
-- 0) Drop FKs that will be replaced
-- -----------------------------------------------------------------------------
ALTER TABLE appointments        DROP CONSTRAINT IF EXISTS appointments_patient_id_fkey;
ALTER TABLE appointments        DROP CONSTRAINT IF EXISTS appointments_doctor_fkey;
ALTER TABLE appointments        DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE appointments        DROP CONSTRAINT IF EXISTS appointments_department_id_fkey;
ALTER TABLE appointments        DROP CONSTRAINT IF EXISTS appointments_organization_id_fkey;

ALTER TABLE encounters          DROP CONSTRAINT IF EXISTS encounters_patient_id_fkey;
ALTER TABLE encounters          DROP CONSTRAINT IF EXISTS encounters_doctor_fkey;

ALTER TABLE diagnoses           DROP CONSTRAINT IF EXISTS diagnoses_patient_id_fkey;
ALTER TABLE diagnoses           DROP CONSTRAINT IF EXISTS diagnoses_doctor_fkey;

ALTER TABLE prescriptions       DROP CONSTRAINT IF EXISTS prescriptions_patient_id_fkey;
ALTER TABLE prescriptions       DROP CONSTRAINT IF EXISTS prescriptions_doctor_fkey;

ALTER TABLE lab_orders          DROP CONSTRAINT IF EXISTS lab_orders_patient_id_fkey;
ALTER TABLE lab_orders          DROP CONSTRAINT IF EXISTS lab_orders_doctor_fkey;
ALTER TABLE lab_orders          DROP CONSTRAINT IF EXISTS lab_orders_organization_id_fkey;

ALTER TABLE lab_order_items     DROP CONSTRAINT IF EXISTS lab_order_items_lab_order_id_fkey;

ALTER TABLE radiology_orders    DROP CONSTRAINT IF EXISTS radiology_orders_patient_id_fkey;
ALTER TABLE radiology_orders    DROP CONSTRAINT IF EXISTS radiology_orders_doctor_fkey;

ALTER TABLE medical_reports     DROP CONSTRAINT IF EXISTS medical_reports_patient_id_fkey;
ALTER TABLE medical_reports     DROP CONSTRAINT IF EXISTS medical_reports_doctor_fkey;

ALTER TABLE call_ai_notes       DROP CONSTRAINT IF EXISTS call_ai_notes_patient_id_fkey;
ALTER TABLE call_ai_notes       DROP CONSTRAINT IF EXISTS call_ai_notes_doctor_id_fkey;
ALTER TABLE call_ai_notes       DROP CONSTRAINT IF EXISTS call_ai_notes_doctor_fkey;

ALTER TABLE ai_summaries        DROP CONSTRAINT IF EXISTS ai_summaries_patient_id_fkey;
ALTER TABLE ai_summaries        DROP CONSTRAINT IF EXISTS ai_summaries_doctor_id_fkey;
ALTER TABLE ai_summaries        DROP CONSTRAINT IF EXISTS ai_summaries_doctor_fkey;

ALTER TABLE video_call_rooms    DROP CONSTRAINT IF EXISTS video_call_rooms_patient_id_fkey;
ALTER TABLE video_call_rooms    DROP CONSTRAINT IF EXISTS video_call_rooms_doctor_fkey;

ALTER TABLE payments            DROP CONSTRAINT IF EXISTS payments_patient_id_fkey;
ALTER TABLE vitals              DROP CONSTRAINT IF EXISTS vitals_patient_id_fkey;
ALTER TABLE user_insurances     DROP CONSTRAINT IF EXISTS user_insurances_patient_id_fkey;

ALTER TABLE inventory_items     DROP CONSTRAINT IF EXISTS inventory_items_organization_id_fkey;
ALTER TABLE inventory_orders    DROP CONSTRAINT IF EXISTS inventory_orders_patient_id_fkey;
ALTER TABLE inventory_orders    DROP CONSTRAINT IF EXISTS inventory_orders_organization_id_fkey;
ALTER TABLE inventory_orders    DROP CONSTRAINT IF EXISTS inventory_orders_ordered_by_fkey;

ALTER TABLE lab_staff_profiles  DROP CONSTRAINT IF EXISTS lab_staff_profiles_organization_id_fkey;
ALTER TABLE lab_slots           DROP CONSTRAINT IF EXISTS lab_slots_lab_staff_id_fkey;
ALTER TABLE lab_slots           DROP CONSTRAINT IF EXISTS lab_slots_organization_id_fkey;
ALTER TABLE lab_appointments    DROP CONSTRAINT IF EXISTS lab_appointments_patient_id_fkey;
ALTER TABLE lab_appointments    DROP CONSTRAINT IF EXISTS lab_appointments_organization_id_fkey;

ALTER TABLE lab_test_catalog    DROP CONSTRAINT IF EXISTS lab_test_catalog_organization_id_fkey;
ALTER TABLE radiology_test_catalog DROP CONSTRAINT IF EXISTS radiology_test_catalog_organization_id_fkey;

ALTER TABLE departments         DROP CONSTRAINT IF EXISTS departments_head_doctor_fkey;
ALTER TABLE departments         DROP CONSTRAINT IF EXISTS departments_organization_id_fkey;
ALTER TABLE doctors             DROP CONSTRAINT IF EXISTS doctors_organization_id_fkey;
ALTER TABLE users               DROP CONSTRAINT IF EXISTS users_organization_id_fkey;

ALTER TABLE doctor_schedules    DROP CONSTRAINT IF EXISTS doctor_schedules_doctor_fkey;

-- -----------------------------------------------------------------------------
-- 1) USERS: remove organization_id
-- -----------------------------------------------------------------------------
ALTER TABLE users DROP COLUMN IF EXISTS organization_id;

-- -----------------------------------------------------------------------------
-- 2) DOCTORS: add id, remove organization_id
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'doctors' AND column_name = 'id'
  ) THEN
    EXECUTE 'CREATE SEQUENCE IF NOT EXISTS doctors_id_seq';
    EXECUTE 'ALTER TABLE doctors ADD COLUMN id INTEGER';
  END IF;
  EXECUTE 'CREATE SEQUENCE IF NOT EXISTS doctors_id_seq';
  EXECUTE 'ALTER TABLE doctors ALTER COLUMN id SET DEFAULT nextval(''doctors_id_seq'')';
END $$;

UPDATE doctors
SET id = nextval('doctors_id_seq')
WHERE id IS NULL;

SELECT setval('doctors_id_seq', COALESCE((SELECT MAX(id) FROM doctors), 0) + 1, false);

ALTER TABLE doctors ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS doctors_id_uidx ON doctors(id);

ALTER TABLE doctors DROP COLUMN IF EXISTS organization_id;

-- -----------------------------------------------------------------------------
-- 3) DEPARTMENTS: org -> branch, head_doctor -> head_user
-- -----------------------------------------------------------------------------
ALTER TABLE departments ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS head_user_id INTEGER;

-- Backfill branch_id from organization default branch
UPDATE departments d
SET branch_id = b.id
FROM branches b
WHERE d.branch_id IS NULL
  AND d.organization_id IS NOT NULL
  AND b.organization_id = d.organization_id
  AND b.branch_seq = 1;

-- Backfill branch_id from head doctor if still missing
UPDATE departments d
SET branch_id = doc.branch_id
FROM doctors doc
WHERE d.branch_id IS NULL
  AND d.head_doctor_id IS NOT NULL
  AND doc.employee_id = d.head_doctor_id
  AND (d.head_doctor_branch_id IS NULL OR doc.branch_id = d.head_doctor_branch_id);

-- Backfill head_user_id from head doctor
UPDATE departments d
SET head_user_id = doc.user_id
FROM doctors doc
WHERE d.head_user_id IS NULL
  AND d.head_doctor_id IS NOT NULL
  AND doc.employee_id = d.head_doctor_id
  AND (d.head_doctor_branch_id IS NULL OR doc.branch_id = d.head_doctor_branch_id);

ALTER TABLE departments DROP COLUMN IF EXISTS organization_id;
ALTER TABLE departments DROP COLUMN IF EXISTS head_doctor_branch_id;
ALTER TABLE departments DROP COLUMN IF EXISTS head_doctor_id;

ALTER TABLE departments
  ADD CONSTRAINT departments_branch_fkey
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE departments
  ADD CONSTRAINT departments_head_user_fkey
  FOREIGN KEY (head_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 4) Rename patient_id -> patient_user_id, doctor_id -> doctor_user_id
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE appointments RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='appointments' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE appointments RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encounters' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encounters' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE encounters RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encounters' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='encounters' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE encounters RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diagnoses' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diagnoses' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE diagnoses RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diagnoses' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='diagnoses' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE diagnoses RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prescriptions' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prescriptions' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE prescriptions RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prescriptions' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prescriptions' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE prescriptions RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_orders' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_orders' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE lab_orders RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_orders' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_orders' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE lab_orders RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_orders' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_orders' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE radiology_orders RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_orders' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_orders' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE radiology_orders RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medical_reports' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medical_reports' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE medical_reports RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medical_reports' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='medical_reports' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE medical_reports RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='call_ai_notes' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='call_ai_notes' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE call_ai_notes RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='call_ai_notes' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='call_ai_notes' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE call_ai_notes RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_summaries' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_summaries' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE ai_summaries RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_summaries' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ai_summaries' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE ai_summaries RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_call_rooms' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_call_rooms' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE video_call_rooms RENAME COLUMN patient_id TO patient_user_id';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_call_rooms' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='video_call_rooms' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE video_call_rooms RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE payments RENAME COLUMN patient_id TO patient_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vitals' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='vitals' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE vitals RENAME COLUMN patient_id TO patient_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_insurances' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_insurances' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE user_insurances RENAME COLUMN patient_id TO patient_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_orders' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_orders' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE inventory_orders RENAME COLUMN patient_id TO patient_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_appointments' AND column_name='patient_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_appointments' AND column_name='patient_user_id') THEN
    EXECUTE 'ALTER TABLE lab_appointments RENAME COLUMN patient_id TO patient_user_id';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5) Other renames / new columns
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_orders' AND column_name='ordered_by')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_orders' AND column_name='order_by_doctor_user_id') THEN
    EXECUTE 'ALTER TABLE inventory_orders RENAME COLUMN ordered_by TO order_by_doctor_user_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_orders' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='inventory_orders' AND column_name='branch_id') THEN
    EXECUTE 'ALTER TABLE inventory_orders RENAME COLUMN organization_id TO branch_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_staff_profiles' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_staff_profiles' AND column_name='branch_id') THEN
    EXECUTE 'ALTER TABLE lab_staff_profiles RENAME COLUMN organization_id TO branch_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_appointments' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_appointments' AND column_name='branch_id') THEN
    EXECUTE 'ALTER TABLE lab_appointments RENAME COLUMN organization_id TO branch_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_test_catalog' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_test_catalog' AND column_name='branch_id') THEN
    EXECUTE 'ALTER TABLE lab_test_catalog RENAME COLUMN organization_id TO branch_id';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_test_catalog' AND column_name='organization_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_test_catalog' AND column_name='branch_id') THEN
    EXECUTE 'ALTER TABLE radiology_test_catalog RENAME COLUMN organization_id TO branch_id';
  END IF;
END $$;

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE inventory_orders ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE lab_staff_profiles ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE lab_slots ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE lab_appointments ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS branch_id INTEGER;
ALTER TABLE radiology_test_catalog ADD COLUMN IF NOT EXISTS branch_id INTEGER;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_slots' AND column_name='lab_staff_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='lab_slots' AND column_name='lab_staff_user_id') THEN
    EXECUTE 'ALTER TABLE lab_slots RENAME COLUMN lab_staff_id TO lab_staff_user_id';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6) Ensure every patient has a users row
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Link patients to existing users (by CNIC/email)
UPDATE patients p
SET user_id = u.id
FROM users u
WHERE p.user_id IS NULL
  AND (
    (p.cnic IS NOT NULL AND u.cnic = p.cnic)
    OR (p.email IS NOT NULL AND u.email = p.email)
  );

-- Create user accounts for remaining patients without user_id
WITH patient_role AS (
  SELECT id AS role_id FROM roles WHERE name = 'patient' LIMIT 1
),
to_create AS (
  SELECT p.*
  FROM patients p
  LEFT JOIN users u_cnic ON (p.cnic IS NOT NULL AND u_cnic.cnic = p.cnic)
  LEFT JOIN users u_email ON (p.email IS NOT NULL AND u_email.email = p.email)
  WHERE p.user_id IS NULL
    AND u_cnic.id IS NULL
    AND u_email.id IS NULL
)
INSERT INTO users (role_id, first_name, last_name, email, password_hash, phone, cnic, is_active)
SELECT
  (SELECT role_id FROM patient_role),
  COALESCE(p.first_name, 'Patient'),
  COALESCE(p.last_name, ''),
  COALESCE(p.email, CONCAT('patient+', p.id, '@migrated.local')),
  crypt('Temp@123', gen_salt('bf')),
  p.phone,
  p.cnic,
  true
FROM to_create p;

-- Link remaining patients to the created users
UPDATE patients p
SET user_id = u.id
FROM users u
WHERE p.user_id IS NULL
  AND (
    (p.cnic IS NOT NULL AND u.cnic = p.cnic)
    OR (u.email = COALESCE(p.email, CONCAT('patient+', p.id, '@migrated.local')))
  );
