-- Migration 018 (part 6/6): sequence resets for test data (section 13)
-- Run this part once and in a single session (uses a TEMP table).

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

-- Temporarily disable FK checks on lab_orders so resequencing does not fail
ALTER TABLE lab_orders DISABLE TRIGGER ALL;

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

ALTER TABLE lab_orders ENABLE TRIGGER ALL;

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
