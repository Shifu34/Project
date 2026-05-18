-- Migration 015: Composite PK for doctors (employee_id, branch_id)
-- Note: keeps UNIQUE(employee_id) to preserve existing FKs that reference doctor_id

-- 1) Ensure all doctors have an org and branch
UPDATE doctors SET organization_id = 1 WHERE organization_id IS NULL;

-- Create default branch (seq=1) per org if missing
INSERT INTO branches (organization_id, branch_seq, branch_code, name, location, phone, email)
SELECT o.id,
       1,
       (o.id::text || '.1') AS branch_code,
       (o.name || ' Main Branch') AS name,
       COALESCE(o.address, 'Main') AS location,
       o.phone,
       o.email
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM branches b WHERE b.organization_id = o.id AND b.branch_seq = 1
);

-- Backfill branch_id using org default branch
UPDATE doctors d
SET branch_id = b.id
FROM branches b
WHERE d.branch_id IS NULL
  AND d.organization_id = b.organization_id
  AND b.branch_seq = 1;

ALTER TABLE doctors ALTER COLUMN branch_id SET NOT NULL;

-- 2) Create UNIQUE on employee_id for FK compatibility
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'doctors_employee_id_uidx'
  ) THEN
    CREATE UNIQUE INDEX doctors_employee_id_uidx ON doctors(employee_id);
  END IF;
END $$;

-- 3) Drop existing PK and create composite PK
-- Drop FKs that reference doctors(employee_id) so we can drop the PK safely
ALTER TABLE doctor_schedules   DROP CONSTRAINT IF EXISTS doctor_schedules_doctor_id_fkey;
ALTER TABLE appointments       DROP CONSTRAINT IF EXISTS appointments_doctor_id_fkey;
ALTER TABLE encounters         DROP CONSTRAINT IF EXISTS encounters_doctor_id_fkey;
ALTER TABLE diagnoses          DROP CONSTRAINT IF EXISTS diagnoses_doctor_id_fkey;
ALTER TABLE prescriptions      DROP CONSTRAINT IF EXISTS prescriptions_doctor_id_fkey;
ALTER TABLE lab_orders         DROP CONSTRAINT IF EXISTS lab_orders_doctor_id_fkey;
ALTER TABLE radiology_orders   DROP CONSTRAINT IF EXISTS radiology_orders_doctor_id_fkey;
ALTER TABLE video_call_rooms   DROP CONSTRAINT IF EXISTS video_call_rooms_doctor_id_fkey;
ALTER TABLE medical_reports    DROP CONSTRAINT IF EXISTS medical_reports_doctor_id_fkey;
ALTER TABLE call_ai_notes      DROP CONSTRAINT IF EXISTS call_ai_notes_doctor_id_fkey;
ALTER TABLE ai_summaries       DROP CONSTRAINT IF EXISTS ai_summaries_doctor_id_fkey;
ALTER TABLE departments        DROP CONSTRAINT IF EXISTS fk_head_doctor;

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_pkey;
ALTER TABLE doctors ADD CONSTRAINT doctors_pkey PRIMARY KEY (employee_id, branch_id);

-- 4) Recreate FKs to doctors(employee_id) (kept unique)
ALTER TABLE doctor_schedules
  ADD CONSTRAINT doctor_schedules_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id) ON DELETE CASCADE;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id);

ALTER TABLE encounters
  ADD CONSTRAINT encounters_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id);

ALTER TABLE diagnoses
  ADD CONSTRAINT diagnoses_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id);

ALTER TABLE prescriptions
  ADD CONSTRAINT prescriptions_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id);

ALTER TABLE lab_orders
  ADD CONSTRAINT lab_orders_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id);

ALTER TABLE radiology_orders
  ADD CONSTRAINT radiology_orders_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id);

ALTER TABLE video_call_rooms
  ADD CONSTRAINT video_call_rooms_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id);

ALTER TABLE medical_reports
  ADD CONSTRAINT medical_reports_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id) ON DELETE SET NULL;

ALTER TABLE call_ai_notes
  ADD CONSTRAINT call_ai_notes_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES doctors(employee_id) ON DELETE SET NULL;

-- Keep department head doctor FK in place (still references employee_id)
ALTER TABLE departments
  ADD CONSTRAINT fk_head_doctor
  FOREIGN KEY (head_doctor_id) REFERENCES doctors(employee_id) ON DELETE SET NULL;
