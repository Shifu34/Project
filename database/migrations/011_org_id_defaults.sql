-- Migration 011: Set DEFAULT 1 on all organization_id columns added in migrations 006-010
--               and backfill any existing NULL rows to 1

-- Set column defaults (future inserts)
ALTER TABLE lab_staff_profiles     ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE lab_slots              ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE lab_appointments       ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE lab_orders             ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE inventory_orders       ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE lab_test_catalog       ALTER COLUMN organization_id SET DEFAULT 1;
ALTER TABLE radiology_test_catalog ALTER COLUMN organization_id SET DEFAULT 1;

-- Backfill existing NULL rows to 1
UPDATE lab_staff_profiles     SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE lab_slots              SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE lab_appointments       SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE lab_orders             SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE inventory_orders       SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE lab_test_catalog       SET organization_id = 1 WHERE organization_id IS NULL;
UPDATE radiology_test_catalog SET organization_id = 1 WHERE organization_id IS NULL;
