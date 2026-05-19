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

-- -----------------------------------------------------------------------------
-- 7) Backfill patient_user_id + doctor_user_id
-- -----------------------------------------------------------------------------
UPDATE appointments a
SET patient_user_id = p.user_id
FROM patients p
WHERE a.patient_user_id = p.id;

UPDATE encounters e
SET patient_user_id = p.user_id
FROM patients p
WHERE e.patient_user_id = p.id;

UPDATE diagnoses d
SET patient_user_id = p.user_id
FROM patients p
WHERE d.patient_user_id = p.id;

UPDATE prescriptions p
SET patient_user_id = pat.user_id
FROM patients pat
WHERE p.patient_user_id = pat.id;

UPDATE lab_orders lo
SET patient_user_id = p.user_id
FROM patients p
WHERE lo.patient_user_id = p.id;

UPDATE radiology_orders ro
SET patient_user_id = p.user_id
FROM patients p
WHERE ro.patient_user_id = p.id;

UPDATE medical_reports mr
SET patient_user_id = p.user_id
FROM patients p
WHERE mr.patient_user_id = p.id;

UPDATE call_ai_notes cn
SET patient_user_id = p.user_id
FROM patients p
WHERE cn.patient_user_id = p.id;

UPDATE ai_summaries s
SET patient_user_id = p.user_id
FROM patients p
WHERE s.patient_user_id = p.id;

UPDATE video_call_rooms v
SET patient_user_id = p.user_id
FROM patients p
WHERE v.patient_user_id = p.id;

UPDATE payments pay
SET patient_user_id = p.user_id
FROM patients p
WHERE pay.patient_user_id = p.id;

UPDATE vitals v
SET patient_user_id = p.user_id
FROM patients p
WHERE v.patient_user_id = p.id;

UPDATE user_insurances ui
SET patient_user_id = p.user_id
FROM patients p
WHERE ui.patient_user_id = p.id;

UPDATE inventory_orders io
SET patient_user_id = p.user_id
FROM patients p
WHERE io.patient_user_id = p.id;

UPDATE lab_appointments la
SET patient_user_id = p.user_id
FROM patients p
WHERE la.patient_user_id = p.id;

-- doctor_user_id from doctors (uses doctor_branch_id if present)
UPDATE appointments a
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = a.doctor_user_id
  AND (a.doctor_branch_id IS NULL OR d.branch_id = a.doctor_branch_id);

UPDATE encounters e
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = e.doctor_user_id
  AND (e.doctor_branch_id IS NULL OR d.branch_id = e.doctor_branch_id);

UPDATE diagnoses dg
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = dg.doctor_user_id
  AND (dg.doctor_branch_id IS NULL OR d.branch_id = dg.doctor_branch_id);

UPDATE prescriptions pr
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = pr.doctor_user_id
  AND (pr.doctor_branch_id IS NULL OR d.branch_id = pr.doctor_branch_id);

UPDATE lab_orders lo
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = lo.doctor_user_id
  AND (lo.doctor_branch_id IS NULL OR d.branch_id = lo.doctor_branch_id);

UPDATE radiology_orders ro
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = ro.doctor_user_id
  AND (ro.doctor_branch_id IS NULL OR d.branch_id = ro.doctor_branch_id);

UPDATE medical_reports mr
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = mr.doctor_user_id
  AND (mr.doctor_branch_id IS NULL OR d.branch_id = mr.doctor_branch_id);

UPDATE call_ai_notes cn
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = cn.doctor_user_id
  AND (cn.doctor_branch_id IS NULL OR d.branch_id = cn.doctor_branch_id);

UPDATE ai_summaries s
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = s.doctor_user_id
  AND (s.doctor_branch_id IS NULL OR d.branch_id = s.doctor_branch_id);

UPDATE video_call_rooms v
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = v.doctor_user_id
  AND (v.doctor_branch_id IS NULL OR d.branch_id = v.doctor_branch_id);

-- -----------------------------------------------------------------------------
-- 8) Backfill lab staff, branch_id
-- -----------------------------------------------------------------------------
-- lab_staff_user_id should be a users.id
UPDATE lab_slots ls
SET lab_staff_user_id = lsp.user_id
FROM lab_staff_profiles lsp
WHERE ls.lab_staff_user_id = lsp.id;

-- If branch_id currently holds org id, map it to default branch
UPDATE lab_staff_profiles lsp
SET branch_id = b.id
FROM branches b
WHERE lsp.branch_id = b.organization_id
  AND b.branch_seq = 1;

UPDATE lab_staff_profiles
SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
WHERE branch_id IS NULL;

UPDATE lab_slots ls
SET branch_id = lsp.branch_id
FROM lab_staff_profiles lsp
WHERE ls.branch_id IS NULL
  AND ls.lab_staff_user_id = lsp.user_id;

UPDATE lab_slots
SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
WHERE branch_id IS NULL;

UPDATE lab_appointments la
SET branch_id = ls.branch_id
FROM lab_slots ls
WHERE la.branch_id IS NULL
  AND la.lab_slot_id = ls.id;

UPDATE lab_appointments
SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
WHERE branch_id IS NULL;

UPDATE lab_test_catalog ltc
SET branch_id = b.id
FROM branches b
WHERE ltc.branch_id = b.organization_id
  AND b.branch_seq = 1;

UPDATE lab_test_catalog
SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
WHERE branch_id IS NULL;

UPDATE radiology_test_catalog rtc
SET branch_id = b.id
FROM branches b
WHERE rtc.branch_id = b.organization_id
  AND b.branch_seq = 1;

UPDATE radiology_test_catalog
SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
WHERE branch_id IS NULL;

UPDATE inventory_items i
SET branch_id = b.id
FROM branches b
WHERE i.branch_id IS NULL
  AND i.organization_id IS NOT NULL
  AND b.organization_id = i.organization_id
  AND b.branch_seq = 1;

UPDATE inventory_items
SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
WHERE branch_id IS NULL;

UPDATE inventory_orders io
SET branch_id = b.id
FROM branches b
WHERE io.branch_id = b.organization_id
  AND b.branch_seq = 1;

UPDATE inventory_orders io
SET branch_id = i.branch_id
FROM inventory_items i
WHERE io.branch_id IS NULL
  AND io.inventory_item_id = i.id;

UPDATE inventory_orders
SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
WHERE branch_id IS NULL;

-- -----------------------------------------------------------------------------
-- 9) Remove old columns
-- -----------------------------------------------------------------------------
ALTER TABLE appointments     DROP COLUMN IF EXISTS department_id;
ALTER TABLE appointments     DROP COLUMN IF EXISTS organization_id;

ALTER TABLE encounters       DROP COLUMN IF EXISTS doctor_branch_id;
ALTER TABLE diagnoses        DROP COLUMN IF EXISTS doctor_branch_id;
ALTER TABLE prescriptions    DROP COLUMN IF EXISTS doctor_branch_id;
ALTER TABLE medical_reports  DROP COLUMN IF EXISTS doctor_branch_id;
ALTER TABLE call_ai_notes    DROP COLUMN IF EXISTS doctor_branch_id;
ALTER TABLE ai_summaries     DROP COLUMN IF EXISTS doctor_branch_id;
ALTER TABLE video_call_rooms DROP COLUMN IF EXISTS doctor_branch_id;

ALTER TABLE lab_orders        DROP COLUMN IF EXISTS organization_id;

ALTER TABLE lab_staff_profiles DROP COLUMN IF EXISTS organization_id;
ALTER TABLE lab_appointments   DROP COLUMN IF EXISTS organization_id;
ALTER TABLE lab_test_catalog   DROP COLUMN IF EXISTS organization_id;
ALTER TABLE radiology_test_catalog DROP COLUMN IF EXISTS organization_id;

ALTER TABLE inventory_orders   DROP COLUMN IF EXISTS organization_id;

ALTER TABLE inventory_items   DROP COLUMN IF EXISTS organization_id;

ALTER TABLE lab_slots          DROP COLUMN IF EXISTS organization_id;

-- Rename doctor_branch_id -> branch_id for radiology_orders
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_orders' AND column_name='doctor_branch_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='radiology_orders' AND column_name='branch_id') THEN
    EXECUTE 'ALTER TABLE radiology_orders RENAME COLUMN doctor_branch_id TO branch_id';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 10) Doctor schedules: doctor_id -> doctor_user_id
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='doctor_schedules' AND column_name='doctor_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='doctor_schedules' AND column_name='doctor_user_id') THEN
    EXECUTE 'ALTER TABLE doctor_schedules RENAME COLUMN doctor_id TO doctor_user_id';
  END IF;
END $$;

UPDATE doctor_schedules ds
SET doctor_user_id = d.user_id
FROM doctors d
WHERE d.employee_id = ds.doctor_user_id
  AND d.branch_id = ds.doctor_branch_id;

-- -----------------------------------------------------------------------------
-- 11) Foreign keys for new linkage
-- -----------------------------------------------------------------------------
ALTER TABLE appointments
  ADD CONSTRAINT appointments_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_branch_fkey FOREIGN KEY (doctor_branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE encounters
  ADD CONSTRAINT encounters_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE encounters
  ADD CONSTRAINT encounters_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE diagnoses
  ADD CONSTRAINT diagnoses_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE diagnoses
  ADD CONSTRAINT diagnoses_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_branch_fkey FOREIGN KEY (doctor_branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE lab_order_items
  ADD CONSTRAINT lab_order_items_lab_order_fkey FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE;

ALTER TABLE radiology_orders
  ADD CONSTRAINT radiology_orders_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE radiology_orders
  ADD CONSTRAINT radiology_orders_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE radiology_orders
  ADD CONSTRAINT radiology_orders_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE medical_reports
  ADD CONSTRAINT medical_reports_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE medical_reports
  ADD CONSTRAINT medical_reports_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE call_ai_notes
  ADD CONSTRAINT call_ai_notes_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE call_ai_notes
  ADD CONSTRAINT call_ai_notes_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE ai_summaries
  ADD CONSTRAINT ai_summaries_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ai_summaries
  ADD CONSTRAINT ai_summaries_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE video_call_rooms
  ADD CONSTRAINT video_call_rooms_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE video_call_rooms
  ADD CONSTRAINT video_call_rooms_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD CONSTRAINT payments_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE vitals
  ADD CONSTRAINT vitals_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE user_insurances
  ADD CONSTRAINT user_insurances_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE inventory_orders
  ADD CONSTRAINT inventory_orders_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE inventory_orders
  ADD CONSTRAINT inventory_orders_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE inventory_orders
  ADD CONSTRAINT inventory_orders_order_by_user_fkey FOREIGN KEY (order_by_doctor_user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE lab_staff_profiles
  ADD CONSTRAINT lab_staff_profiles_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE lab_slots
  ADD CONSTRAINT lab_slots_lab_staff_user_fkey FOREIGN KEY (lab_staff_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lab_slots
  ADD CONSTRAINT lab_slots_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE lab_appointments
  ADD CONSTRAINT lab_appointments_patient_user_fkey FOREIGN KEY (patient_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE lab_appointments
  ADD CONSTRAINT lab_appointments_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE lab_test_catalog
  ADD CONSTRAINT lab_test_catalog_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE radiology_test_catalog
  ADD CONSTRAINT radiology_test_catalog_branch_fkey FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE doctor_schedules
  ADD CONSTRAINT doctor_schedules_doctor_user_fkey FOREIGN KEY (doctor_user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE doctor_schedules
  ADD CONSTRAINT doctor_schedules_branch_fkey FOREIGN KEY (doctor_branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- 12) Indexes
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_appt_patient;
DROP INDEX IF EXISTS idx_appt_doctor;
DROP INDEX IF EXISTS idx_appt_doctor_branch;
DROP INDEX IF EXISTS idx_appointments_org;
DROP INDEX IF EXISTS idx_payments_patient;
DROP INDEX IF EXISTS idx_encounters_patient;
DROP INDEX IF EXISTS idx_encounters_doctor;
DROP INDEX IF EXISTS idx_enc_doctor_branch;
DROP INDEX IF EXISTS idx_diagnoses_patient;
DROP INDEX IF EXISTS idx_diag_doctor_branch;
DROP INDEX IF EXISTS idx_prescriptions_patient;
DROP INDEX IF EXISTS idx_presc_doctor_branch;
DROP INDEX IF EXISTS idx_lab_orders_patient;
DROP INDEX IF EXISTS idx_lab_orders_org;
DROP INDEX IF EXISTS idx_lab_orders_doctor_branch;
DROP INDEX IF EXISTS idx_radio_orders_patient;
DROP INDEX IF EXISTS idx_radio_orders_doctor_branch;
DROP INDEX IF EXISTS idx_inv_items_org;
DROP INDEX IF EXISTS idx_inv_orders_patient;
DROP INDEX IF EXISTS idx_inv_orders_org;
DROP INDEX IF EXISTS idx_lab_slots_staff;
DROP INDEX IF EXISTS idx_lab_appt_patient;
DROP INDEX IF EXISTS idx_call_ai_notes_patient;
DROP INDEX IF EXISTS idx_call_ai_notes_doctor;
DROP INDEX IF EXISTS idx_ai_summaries_patient;
DROP INDEX IF EXISTS idx_vcr_doctor_branch;
DROP INDEX IF EXISTS idx_doc_sched_doctor_branch;

CREATE INDEX IF NOT EXISTS idx_appt_patient_user       ON appointments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_user        ON appointments(doctor_user_id, doctor_branch_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient_user   ON payments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_encounters_patient_user ON encounters(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_encounters_doctor_user  ON encounters(doctor_user_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_patient_user  ON diagnoses(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_user ON prescriptions(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_user ON lab_orders(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_radio_orders_patient_user ON radiology_orders(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_branch        ON inventory_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_patient_user ON inventory_orders(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_branch       ON inventory_orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_order_by_user ON inventory_orders(order_by_doctor_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_slots_staff_user    ON lab_slots(lab_staff_user_id, slot_date);
CREATE INDEX IF NOT EXISTS idx_lab_appt_patient_user   ON lab_appointments(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_notes_patient_user ON call_ai_notes(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_notes_doctor_user  ON call_ai_notes(doctor_user_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_patient_user  ON ai_summaries(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_doc_sched_doctor_user_branch ON doctor_schedules(doctor_user_id, doctor_branch_id);

-- -----------------------------------------------------------------------------
-- 13) Sequence resets for test data
-- -----------------------------------------------------------------------------
-- Patients: resequence IDs from 1..N (no remaining FKs to patients.id)
WITH ordered_patients AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS new_id
  FROM patients
)
UPDATE patients p
SET id = op.new_id
FROM ordered_patients op
WHERE p.id = op.id;

SELECT setval(pg_get_serial_sequence('patients','id'), COALESCE((SELECT MAX(id) FROM patients), 0) + 1, false);

-- Lab orders: resequence IDs and update dependents
CREATE TEMP TABLE tmp_lab_orders_map AS
SELECT id AS old_id, ROW_NUMBER() OVER (ORDER BY id) AS new_id
FROM lab_orders;

UPDATE lab_orders SET id = id + 1000000;

UPDATE lab_orders lo
SET id = m.new_id
FROM tmp_lab_orders_map m
WHERE lo.id = m.old_id + 1000000;

UPDATE lab_order_items loi
SET lab_order_id = m.new_id
FROM tmp_lab_orders_map m
WHERE loi.lab_order_id = m.old_id;

UPDATE ai_summaries s
SET lab_order_id = m.new_id
FROM tmp_lab_orders_map m
WHERE s.lab_order_id = m.old_id;

UPDATE medical_reports mr
SET lab_order_id = m.new_id
FROM tmp_lab_orders_map m
WHERE mr.lab_order_id = m.old_id;

DROP TABLE tmp_lab_orders_map;

SELECT setval(pg_get_serial_sequence('lab_orders','id'), COALESCE((SELECT MAX(id) FROM lab_orders), 0) + 1, false);

-- Lab order items: resequence IDs
WITH ordered_lab_order_items AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS new_id
  FROM lab_order_items
)
UPDATE lab_order_items loi
SET id = oli.new_id
FROM ordered_lab_order_items oli
WHERE loi.id = oli.id;

SELECT setval(pg_get_serial_sequence('lab_order_items','id'), COALESCE((SELECT MAX(id) FROM lab_order_items), 0) + 1, false);
