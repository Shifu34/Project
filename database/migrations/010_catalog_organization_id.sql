-- Migration 010: Add organization_id to lab_test_catalog and radiology_test_catalog
-- (inventory_items already has organization_id from the base schema)

ALTER TABLE lab_test_catalog
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

ALTER TABLE radiology_test_catalog
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lab_test_catalog_org  ON lab_test_catalog (organization_id);
CREATE INDEX IF NOT EXISTS idx_radio_test_catalog_org ON radiology_test_catalog (organization_id);
