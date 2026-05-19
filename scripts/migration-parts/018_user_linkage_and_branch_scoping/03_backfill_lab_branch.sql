-- Migration 018 (part 3/6): backfill lab staff and branch_id (section 8)

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
