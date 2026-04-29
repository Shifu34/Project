-- Migration 004: AI Summaries + Call Transcriptions
-- Run once against the production DB.

-- ─── 1. AI Summaries ────────────────────────────────────────────────────────
-- Stores AI-generated summaries for any context: end-of-call, encounter,
-- report, lab order, radiology order, or prescription.
-- Exactly one of the *_id FK columns should be non-null (except patient_id
-- which is always required for quick retrieval).

CREATE TABLE IF NOT EXISTS ai_summaries (
  id                  SERIAL PRIMARY KEY,

  -- What context was this summary generated for?
  summary_type        VARCHAR(30) NOT NULL
                        CHECK (summary_type IN (
                          'call',
                          'encounter',
                          'report',
                          'lab_order',
                          'radiology_order',
                          'prescription',
                          'general'
                        )),

  -- Context FK — only the relevant one is populated
  appointment_id      INT  REFERENCES appointments(id)       ON DELETE SET NULL,
  encounter_id        INT  REFERENCES encounters(id)          ON DELETE SET NULL,
  report_id           INT  REFERENCES medical_reports(id)     ON DELETE SET NULL,
  lab_order_id        INT  REFERENCES lab_orders(id)          ON DELETE SET NULL,
  radiology_order_id  INT  REFERENCES radiology_orders(id)    ON DELETE SET NULL,
  prescription_id     INT  REFERENCES prescriptions(id)       ON DELETE SET NULL,

  -- Always required
  patient_id          INT  NOT NULL REFERENCES patients(id)   ON DELETE CASCADE,
  doctor_id           INT  REFERENCES doctors(id)             ON DELETE SET NULL,

  -- Content
  content             TEXT NOT NULL,
  ai_model            VARCHAR(100),              -- e.g. 'gpt-4o', 'gemini-1.5-pro'
  language            VARCHAR(10) DEFAULT 'en',  -- ISO 639-1

  -- Audit
  generated_by        INT  REFERENCES users(id)  ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_summaries_patient      ON ai_summaries(patient_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_appointment  ON ai_summaries(appointment_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_encounter    ON ai_summaries(encounter_id);
CREATE INDEX IF NOT EXISTS idx_ai_summaries_type         ON ai_summaries(summary_type);


-- ─── 2. Call Transcriptions ──────────────────────────────────────────────────
-- Stores the full text transcription of a video/audio call.
-- Linked to an appointment (which has the doctor + patient context).

CREATE TABLE IF NOT EXISTS call_transcriptions (
  id                  SERIAL PRIMARY KEY,

  appointment_id      INT  REFERENCES appointments(id)  ON DELETE SET NULL,
  room_name           VARCHAR(255),     -- LiveKit room name

  -- Full transcription text (could be very long)
  transcription       TEXT NOT NULL,
  language            VARCHAR(10) DEFAULT 'en',

  -- Timing
  duration_seconds    INT,
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,

  -- Audit
  created_by          INT  REFERENCES users(id)  ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_transcriptions_appointment ON call_transcriptions(appointment_id);
