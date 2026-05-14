-- Migration 013: Add 'payment_timeout' as a dedicated appointment status
--               Clean up old cancellation_reason-based approach from migration 012 fix

-- 1. Drop the old CHECK constraint and recreate with payment_timeout included
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_status_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('scheduled','confirmed','in_progress','pending','completed','cancelled','no_show','payment_timeout'));

-- 2. Migrate any rows that were soft-cancelled with cancellation_reason='payment_timeout'
--    back to the new dedicated status
UPDATE appointments
SET status              = 'payment_timeout',
    cancellation_reason = NULL,
    cancelled_by        = NULL,
    updated_at          = NOW()
WHERE status = 'cancelled'
  AND cancellation_reason = 'payment_timeout';
