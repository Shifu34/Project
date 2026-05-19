-- Migration 018 (part 4/6): cleanup old columns and add FKs (sections 9-11)

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
