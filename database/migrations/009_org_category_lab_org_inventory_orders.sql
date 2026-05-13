-- Migration 009: Organization category, lab_orders org link, inventory orders table

-- 1. Add category to organizations
--    Values: hospital | lab | pharmacy | clinic | diagnostic_center
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS category VARCHAR(30)
    CHECK (category IN ('hospital','lab','pharmacy'));

-- 2. Link organization_id into lab_orders
--    (lab_slots/lab_appointments already have it from migration 007)
ALTER TABLE lab_orders
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- Backfill: infer from the ordering doctor's organization
UPDATE lab_orders lo
SET organization_id = u.organization_id
FROM doctors d
JOIN users u ON u.id = d.user_id
WHERE d.id = lo.doctor_id
  AND lo.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lab_orders_org ON lab_orders (organization_id);

-- 3. Inventory orders — items purchased directly by patients
CREATE TABLE IF NOT EXISTS inventory_orders (
  id                SERIAL PRIMARY KEY,
  patient_id        INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  organization_id   INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price        DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  total_amount      DECIMAL(12,2) NOT NULL,          -- stored: quantity * unit_price
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','completed','cancelled')),
  notes             TEXT,
  ordered_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inv_orders_patient  ON inventory_orders (patient_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_item     ON inventory_orders (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_org      ON inventory_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_inv_orders_status   ON inventory_orders (status);
