-- Migration 014: Branches + doctor employee_id + branch linkage

-- 1) Branches table
CREATE TABLE IF NOT EXISTS branches (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_seq      INTEGER NOT NULL,
  branch_code     TEXT NOT NULL, -- e.g. "1.1" (org_id.branch_seq)
  name            VARCHAR(150) NOT NULL,
  location        VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  email           VARCHAR(255),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organization_id, branch_seq),
  UNIQUE (branch_code)
);

-- Keep updated_at in sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_branches_updated_at'
  ) THEN
    CREATE TRIGGER trg_branches_updated_at
      BEFORE UPDATE ON branches
      FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_branches_org ON branches (organization_id);

-- 2) Ensure doctors has organization_id (keep for now as requested)
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

-- 3) Add branch_id + account_status to doctors
ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'unclaimed';

ALTER TABLE doctors DROP CONSTRAINT IF EXISTS doctors_account_status_check;
ALTER TABLE doctors
  ADD CONSTRAINT doctors_account_status_check
  CHECK (account_status IN ('unclaimed','claim_pending','active','rejected','suspended','inactive'));

-- Mark existing doctors with user accounts as active
UPDATE doctors SET account_status = 'active' WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_branch ON doctors (branch_id);

-- 4) Rename doctors.id -> employee_id (safe if already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'doctors' AND column_name = 'id'
  ) THEN
    ALTER TABLE doctors RENAME COLUMN id TO employee_id;
  END IF;
END $$;

-- 5) Backfill doctors.organization_id from users (if missing)
UPDATE doctors d
SET organization_id = u.organization_id
FROM users u
WHERE d.user_id = u.id
  AND d.organization_id IS NULL
  AND u.organization_id IS NOT NULL;

-- 6) Create a default branch (seq=1) per organization
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

-- 7) Backfill doctors.branch_id using their organization_id
UPDATE doctors d
SET branch_id = b.id
FROM branches b
WHERE d.branch_id IS NULL
  AND d.organization_id = b.organization_id
  AND b.branch_seq = 1;
