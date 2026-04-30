-- Migration 005: Call AI Notes + Improvements
-- Run once against the production DB.

-- ─── 1. call_ai_notes ────────────────────────────────────────────────────────
-- Stores real-time AI-generated notes captured DURING a call.
-- Visibility: doctor-only (enforced at API layer).
-- Separate from ai_summaries (which is the post-call summary visible to all).

CREATE TABLE IF NOT EXISTS call_ai_notes (
  id              SERIAL PRIMARY KEY,

  appointment_id  INT REFERENCES appointments(id) ON DELETE CASCADE,
  room_id         VARCHAR(255),        -- 100ms room_id from video_call_rooms
  patient_id      INT REFERENCES patients(id)     ON DELETE CASCADE,
  doctor_id       INT REFERENCES doctors(id)      ON DELETE SET NULL,

  note_type       VARCHAR(30) DEFAULT 'realtime'
                    CHECK (note_type IN ('realtime', 'interim', 'final')),

  -- Raw text notes (full transcript-style or narrative)
  content         TEXT,

  -- Structured key-value pairs for variable extraction
  -- e.g. { "chief_complaint": "chest pain", "bp": "120/80", "diagnosis": "angina" }
  structured_data JSONB,

  ai_model        VARCHAR(100),
  language        VARCHAR(10) DEFAULT 'en',

  -- Audit
  created_by      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_ai_notes_appointment ON call_ai_notes(appointment_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_notes_room        ON call_ai_notes(room_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_notes_patient     ON call_ai_notes(patient_id);
CREATE INDEX IF NOT EXISTS idx_call_ai_notes_doctor      ON call_ai_notes(doctor_id);


-- ─── 2. Add structured_data to ai_summaries ──────────────────────────────────
-- Allows post-call summaries to store structured key-value pairs for
-- variable extraction (same pattern as call_ai_notes.structured_data).

ALTER TABLE ai_summaries
  ADD COLUMN IF NOT EXISTS structured_data JSONB;


-- ─── 3. Add room_id to call_transcriptions ───────────────────────────────────
-- Link transcriptions to the 100ms room as well as the appointment.

ALTER TABLE call_transcriptions
  ADD COLUMN IF NOT EXISTS room_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_call_transcriptions_room ON call_transcriptions(room_id);


-- ─── 4. Triggers for updated_at ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_call_ai_notes_updated_at'
  ) THEN
    CREATE TRIGGER trg_call_ai_notes_updated_at
      BEFORE UPDATE ON call_ai_notes
      FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
  END IF;
END $$;
