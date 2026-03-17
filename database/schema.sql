-- =============================================================
-- Murshid Hospital System - PostgreSQL Database Schema
-- Total: 34 tables
-- =============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- 1. ORGANIZATIONS  (multi-tenant support)
-- =============================================================
CREATE TABLE organizations (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    address     TEXT,
    phone       VARCHAR(20),
    email       VARCHAR(255),
    logo_url    VARCHAR(500),
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 2. ROLES
-- =============================================================
CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 3. USERS
-- =============================================================
CREATE TABLE users (
    id              SERIAL PRIMARY KEY,
    role_id         INT NOT NULL REFERENCES roles(id),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    cnic            VARCHAR(15) UNIQUE,
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 4. USER_PROFILES
-- =============================================================
CREATE TABLE user_profiles (
    id            SERIAL PRIMARY KEY,
    user_id       INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    address       TEXT,
    profile_image VARCHAR(500),
    nationality   VARCHAR(100),
    bio           TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 5. PATIENTS
-- =============================================================
CREATE SEQUENCE patient_code_seq START 1;

CREATE TABLE patients (
    id                         SERIAL PRIMARY KEY,
    patient_code               VARCHAR(20) UNIQUE,
    first_name                 VARCHAR(100) NOT NULL,
    last_name                  VARCHAR(100) NOT NULL,
    email                      VARCHAR(255) UNIQUE,
    phone                      VARCHAR(20) NOT NULL,
    gender                     VARCHAR(10) CHECK (gender IN ('male','female','other')),
    date_of_birth              DATE NOT NULL,
    blood_type                 VARCHAR(5) CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    address                    TEXT,
    emergency_contact_name     VARCHAR(100),
    emergency_contact_phone    VARCHAR(20),
    emergency_contact_relation VARCHAR(50),
    marital_status             VARCHAR(20) CHECK (marital_status IN ('single','married','divorced','widowed')),
    occupation                 VARCHAR(100),
    nationality                VARCHAR(100),
    cnic                       VARCHAR(15),
    source_pid                 INT,          -- legacy source system PID (migration only)
    user_id                    INT REFERENCES users(id) ON DELETE SET NULL,
    status                     VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','deceased')),
    registered_by              INT REFERENCES users(id) ON DELETE SET NULL,
    created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index so ON CONFLICT (cnic) WHERE cnic IS NOT NULL works
CREATE UNIQUE INDEX patients_cnic_uidx ON patients (cnic) WHERE cnic IS NOT NULL;

CREATE OR REPLACE FUNCTION generate_patient_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.patient_code IS NULL AND NEW.source_pid IS NOT NULL THEN
        NEW.patient_code := 'MH-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-'
                            || LPAD(NEXTVAL('patient_code_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_patient_code
    BEFORE INSERT ON patients
    FOR EACH ROW EXECUTE FUNCTION generate_patient_code();

-- =============================================================
-- 6. INSURANCE_PROVIDERS
-- =============================================================
CREATE TABLE insurance_providers (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(200) NOT NULL UNIQUE,
    contact_phone VARCHAR(20),
    contact_email VARCHAR(255),
    address       TEXT,
    website       VARCHAR(500),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 7. USER_INSURANCES
-- =============================================================
CREATE TABLE user_insurances (
    id                    SERIAL PRIMARY KEY,
    patient_id            INT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    insurance_provider_id INT NOT NULL REFERENCES insurance_providers(id),
    policy_number         VARCHAR(100) NOT NULL,
    group_number          VARCHAR(100),
    coverage_type         VARCHAR(50),
    coverage_percentage   DECIMAL(5,2),
    valid_from            DATE,
    valid_to              DATE,
    is_primary            BOOLEAN DEFAULT TRUE,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 8. DEPARTMENTS
-- =============================================================
CREATE TABLE departments (
    id              SERIAL PRIMARY KEY,
    organization_id INT REFERENCES organizations(id) ON DELETE SET NULL,
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    head_doctor_id  INT,
    phone           VARCHAR(20),
    location        VARCHAR(100),
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 9. DOCTORS
-- =============================================================
CREATE TABLE doctors (
    id               SERIAL PRIMARY KEY,
    user_id          INT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    department_id    INT REFERENCES departments(id) ON DELETE SET NULL,
    -- Personal info stored directly so migrated doctors (user_id=NULL) still have names/contact
    first_name       VARCHAR(100),
    last_name        VARCHAR(100),
    email            VARCHAR(255),
    phone            VARCHAR(20),
    gender           VARCHAR(10) CHECK (gender IN ('male','female','other')),
    date_of_birth    DATE,
    specialization   VARCHAR(100),
    license_number   VARCHAR(50),
    qualification    TEXT,
    experience_years INT,
    consultation_fee DECIMAL(10,2),
    bio              TEXT,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Partial unique index: allows multiple NULL license_numbers (migrated doctors without pid)
CREATE UNIQUE INDEX doctors_license_nr_uidx ON doctors (license_number) WHERE license_number IS NOT NULL;

ALTER TABLE departments
    ADD CONSTRAINT fk_head_doctor
    FOREIGN KEY (head_doctor_id) REFERENCES doctors(id) ON DELETE SET NULL;

-- =============================================================
-- 10. DOCTOR_SCHEDULES
-- =============================================================
CREATE TABLE doctor_schedules (
    id               SERIAL PRIMARY KEY,
    doctor_id        INT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
    day_of_week      VARCHAR(10) NOT NULL
                         CHECK (day_of_week IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
    appointment_type VARCHAR(30) NOT NULL DEFAULT 'Online Consultation'
                         CHECK (appointment_type IN ('In-clinic Visit','Online Consultation')),
    start_time       TIME NOT NULL,
    end_time         TIME NOT NULL,
    max_appointments INT DEFAULT 20,
    is_available     BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (doctor_id, day_of_week, appointment_type)
);

-- =============================================================
-- 11. APPOINTMENTS
-- =============================================================
CREATE TABLE appointments (
    id                  SERIAL PRIMARY KEY,
    patient_id          INT NOT NULL REFERENCES patients(id),
    doctor_id           INT NOT NULL REFERENCES doctors(id),
    department_id       INT REFERENCES departments(id),
    appointment_date    DATE NOT NULL,
    appointment_time    TIME NOT NULL,
    duration_minutes    INT DEFAULT 30,
    appointment_type    VARCHAR(30) NOT NULL DEFAULT 'Online Consultation'
                            CHECK (appointment_type IN ('In-clinic Visit','Online Consultation')),
    nature_of_visit     VARCHAR(30) CHECK (nature_of_visit IN
                            ('consultation','follow_up','emergency','procedure','checkup')),
    status              VARCHAR(20) DEFAULT 'scheduled'
                            CHECK (status IN ('scheduled','confirmed','in_progress','completed','cancelled','no_show')),
    reason              TEXT,
    notes               TEXT,
    booked_by           INT REFERENCES users(id) ON DELETE SET NULL,
    cancelled_by        INT REFERENCES users(id) ON DELETE SET NULL,
    cancellation_reason TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 12. PAYMENTS
-- =============================================================
CREATE TABLE payments (
    id                    SERIAL PRIMARY KEY,
    appointment_id        INT REFERENCES appointments(id) ON DELETE SET NULL,
    patient_id            INT NOT NULL REFERENCES patients(id),
    amount                DECIMAL(12,2) NOT NULL,
    payment_method        VARCHAR(30) CHECK (payment_method IN
                              ('cash','credit_card','debit_card','insurance','bank_transfer','cheque','online')),
    transaction_reference VARCHAR(100),
    payment_status        VARCHAR(20) DEFAULT 'completed'
                              CHECK (payment_status IN ('completed','pending','failed','refunded')),
    paid_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes                 TEXT,
    received_by           INT REFERENCES users(id) ON DELETE SET NULL,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 13. PAYMENT_REFUNDS
-- =============================================================
CREATE TABLE payment_refunds (
    id          SERIAL PRIMARY KEY,
    payment_id  INT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    amount      DECIMAL(12,2) NOT NULL,
    reason      TEXT,
    status      VARCHAR(20) DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','completed')),
    refunded_by INT REFERENCES users(id) ON DELETE SET NULL,
    refunded_at TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 14. ENCOUNTERS
-- =============================================================
CREATE TABLE encounters (
    id                         SERIAL PRIMARY KEY,
    appointment_id             INT UNIQUE REFERENCES appointments(id) ON DELETE SET NULL,
    patient_id                 INT NOT NULL REFERENCES patients(id),
    doctor_id                  INT NOT NULL REFERENCES doctors(id),
    encounter_date             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    encounter_type             VARCHAR(20) CHECK (encounter_type IN
                                   ('outpatient','inpatient','emergency','telemedicine')),
    chief_complaint            TEXT,
    history_of_present_illness TEXT,
    physical_examination       TEXT,
    assessment                 TEXT,
    plan                       TEXT,
    follow_up_date             DATE,
    status                     VARCHAR(20) DEFAULT 'in_progress'
                                   CHECK (status IN ('in_progress','completed','transferred')),
    created_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                 TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 15. DIAGNOSES
-- =============================================================
CREATE TABLE diagnoses (
    id             SERIAL PRIMARY KEY,
    encounter_id   INT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id     INT NOT NULL REFERENCES patients(id),
    doctor_id      INT NOT NULL REFERENCES doctors(id),
    icd_code       VARCHAR(20),
    diagnosis_text TEXT NOT NULL,
    diagnosis_type VARCHAR(20) CHECK (diagnosis_type IN ('primary','secondary','differential')),
    status         VARCHAR(20) DEFAULT 'active'
                       CHECK (status IN ('active','resolved','chronic','remission')),
    diagnosed_date DATE DEFAULT CURRENT_DATE,
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 16. CLINICAL_NOTES
-- =============================================================
CREATE TABLE clinical_notes (
    id           SERIAL PRIMARY KEY,
    encounter_id INT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    doctor_id    INT NOT NULL REFERENCES users(id),
    note_type    VARCHAR(30) CHECK (note_type IN
                     ('progress','admission','discharge','procedure','consultation','general')),
    content      TEXT NOT NULL,
    is_signed    BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 17. VITALS
-- =============================================================
CREATE TABLE vitals (
    id                       SERIAL PRIMARY KEY,
    encounter_id             INT NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
    patient_id               INT NOT NULL REFERENCES patients(id),
    recorded_by              INT REFERENCES users(id) ON DELETE SET NULL,
    temperature              DECIMAL(4,1),
    blood_pressure_systolic  INT,
    blood_pressure_diastolic INT,
    heart_rate               INT,
    respiratory_rate         INT,
    oxygen_saturation        DECIMAL(4,1),
    weight                   DECIMAL(5,2),
    height                   DECIMAL(5,2),
    bmi                      DECIMAL(4,1),
    blood_glucose            DECIMAL(5,1),
    pain_scale               INT CHECK (pain_scale BETWEEN 0 AND 10),
    notes                    TEXT,
    recorded_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 18. PRESCRIPTIONS
-- =============================================================
CREATE TABLE prescriptions (
    id                SERIAL PRIMARY KEY,
    encounter_id      INT NOT NULL REFERENCES encounters(id),
    patient_id        INT NOT NULL REFERENCES patients(id),
    doctor_id         INT NOT NULL REFERENCES doctors(id),
    prescription_date DATE DEFAULT CURRENT_DATE,
    valid_until       DATE,
    status            VARCHAR(25) DEFAULT 'active'
                          CHECK (status IN ('active','dispensed','partially_dispensed','expired','cancelled')),
    notes             TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 20. INVENTORY_ITEMS  (created before prescription_items for FK)
-- =============================================================
CREATE TABLE inventory_items (
    id                 SERIAL PRIMARY KEY,
    organization_id    INT REFERENCES organizations(id) ON DELETE SET NULL,
    name               VARCHAR(200) NOT NULL,
    generic_name       VARCHAR(200),
    category           VARCHAR(100),
    dosage_form        VARCHAR(50),
    strength           VARCHAR(50),
    unit               VARCHAR(20),
    description        TEXT,
    reorder_level      INT DEFAULT 10,
    quantity_available INT DEFAULT 0,
    is_controlled      BOOLEAN DEFAULT FALSE,
    is_active          BOOLEAN DEFAULT TRUE,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 19. PRESCRIPTION_ITEMS
-- =============================================================
CREATE TABLE prescription_items (
    id                SERIAL PRIMARY KEY,
    prescription_id   INT NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
    inventory_item_id INT REFERENCES inventory_items(id) ON DELETE SET NULL,
    medication_name   VARCHAR(200) NOT NULL,
    dosage            VARCHAR(100) NOT NULL,
    frequency         VARCHAR(100) NOT NULL,
    duration          VARCHAR(50),
    quantity          INT NOT NULL,
    route             VARCHAR(50),
    instructions      TEXT,
    is_dispensed      BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 21. INVENTORY_TRANSACTIONS
-- =============================================================
CREATE TABLE inventory_transactions (
    id                SERIAL PRIMARY KEY,
    inventory_item_id INT NOT NULL REFERENCES inventory_items(id),
    transaction_type  VARCHAR(20) NOT NULL
                          CHECK (transaction_type IN ('stock_in','stock_out','adjustment','dispense','return','expired')),
    quantity          INT NOT NULL,
    unit_price        DECIMAL(10,2),
    reference_id      INT,
    reference_type    VARCHAR(50),
    notes             TEXT,
    performed_by      INT REFERENCES users(id) ON DELETE SET NULL,
    transaction_date  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION fn_sync_inventory_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.transaction_type IN ('stock_in','return') THEN
        UPDATE inventory_items
        SET quantity_available = quantity_available + NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.inventory_item_id;
    ELSIF NEW.transaction_type IN ('stock_out','dispense','expired') THEN
        UPDATE inventory_items
        SET quantity_available = GREATEST(0, quantity_available - NEW.quantity),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.inventory_item_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_inventory
    AFTER INSERT ON inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION fn_sync_inventory_quantity();

-- =============================================================
-- 22. LAB_TEST_CATALOG
-- =============================================================
CREATE TABLE lab_test_catalog (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(200) NOT NULL,
    code             VARCHAR(50) UNIQUE,
    category         VARCHAR(100),
    description      TEXT,
    normal_range     TEXT,           -- human-readable display range
    lo_bound         DECIMAL(12,4),  -- numeric lower bound for interpretation
    hi_bound         DECIMAL(12,4),  -- numeric upper bound for interpretation
    unit             VARCHAR(50),
    price            DECIMAL(10,2),
    turnaround_hours INT,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 23. LAB_ORDERS
-- =============================================================
CREATE TABLE lab_orders (
    id             SERIAL PRIMARY KEY,
    encounter_id   INT NOT NULL REFERENCES encounters(id),
    patient_id     INT NOT NULL REFERENCES patients(id),
    doctor_id      INT NOT NULL REFERENCES doctors(id),
    ordered_by     INT REFERENCES users(id) ON DELETE SET NULL,
    order_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    priority       VARCHAR(20) DEFAULT 'routine'
                       CHECK (priority IN ('routine','urgent','stat')),
    status         VARCHAR(25) DEFAULT 'ordered'
                       CHECK (status IN ('ordered','sample_collected','processing','completed','cancelled')),
    clinical_notes TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 24. LAB_ORDER_ITEMS  (includes results)
-- =============================================================
CREATE TABLE lab_order_items (
    id             SERIAL PRIMARY KEY,
    lab_order_id   INT NOT NULL REFERENCES lab_orders(id) ON DELETE CASCADE,
    lab_test_id    INT NOT NULL REFERENCES lab_test_catalog(id),
    status         VARCHAR(20) DEFAULT 'pending'
                       CHECK (status IN ('pending','processing','completed','cancelled')),
    result_value   TEXT,
    unit           VARCHAR(50),
    normal_range   TEXT,
    interpretation VARCHAR(20)
                       CHECK (interpretation IN ('normal','low','high','critical_low','critical_high')),
    result_notes   TEXT,
    result_date    TIMESTAMP,
    performed_by   INT REFERENCES users(id) ON DELETE SET NULL,
    verified_by    INT REFERENCES users(id) ON DELETE SET NULL,
    verified_at    TIMESTAMP,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 25. RADIOLOGY_TEST_CATALOG
-- =============================================================
CREATE TABLE radiology_test_catalog (
    id               SERIAL PRIMARY KEY,
    name             VARCHAR(200) NOT NULL,
    code             VARCHAR(50) UNIQUE,
    modality         VARCHAR(50)
                         CHECK (modality IN ('X-Ray','CT Scan','MRI','Ultrasound','PET Scan','Mammography','Fluoroscopy','Other')),
    description      TEXT,
    price            DECIMAL(10,2),
    turnaround_hours INT,
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 26. RADIOLOGY_ORDERS
-- =============================================================
CREATE TABLE radiology_orders (
    id             SERIAL PRIMARY KEY,
    encounter_id   INT NOT NULL REFERENCES encounters(id),
    patient_id     INT NOT NULL REFERENCES patients(id),
    doctor_id      INT NOT NULL REFERENCES doctors(id),
    ordered_by     INT REFERENCES users(id) ON DELETE SET NULL,
    order_date     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    priority       VARCHAR(20) DEFAULT 'routine'
                       CHECK (priority IN ('routine','urgent','stat')),
    status         VARCHAR(20) DEFAULT 'ordered'
                       CHECK (status IN ('ordered','scheduled','in_progress','completed','cancelled')),
    clinical_notes TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 27. RADIOLOGY_ORDER_ITEMS  (includes results)
-- =============================================================
CREATE TABLE radiology_order_items (
    id                 SERIAL PRIMARY KEY,
    radiology_order_id INT NOT NULL REFERENCES radiology_orders(id) ON DELETE CASCADE,
    radiology_test_id  INT NOT NULL REFERENCES radiology_test_catalog(id),
    status             VARCHAR(20) DEFAULT 'ordered'
                           CHECK (status IN ('ordered','scheduled','in_progress','completed','cancelled')),
    findings           TEXT,
    impression         TEXT,
    recommendation     TEXT,
    image_url          VARCHAR(500),
    report_date        TIMESTAMP,
    performed_by       INT REFERENCES users(id) ON DELETE SET NULL,
    verified_by        INT REFERENCES users(id) ON DELETE SET NULL,
    verified_at        TIMESTAMP,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 28. SUBSCRIPTION_PLANS
-- =============================================================
CREATE TABLE subscription_plans (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(100) NOT NULL UNIQUE,
    description   TEXT,
    price         DECIMAL(10,2) NOT NULL,
    billing_cycle VARCHAR(20) CHECK (billing_cycle IN ('monthly','yearly','lifetime')),
    features      JSONB,
    max_users     INT,
    max_patients  INT,
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 29. USER_SUBSCRIPTIONS
-- =============================================================
CREATE TABLE user_subscriptions (
    id                SERIAL PRIMARY KEY,
    organization_id   INT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plan_id           INT NOT NULL REFERENCES subscription_plans(id),
    start_date        DATE NOT NULL,
    end_date          DATE,
    status            VARCHAR(20) DEFAULT 'active'
                          CHECK (status IN ('active','expired','cancelled','trial')),
    payment_reference VARCHAR(100),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 30. AI_SESSIONS
-- =============================================================
CREATE TABLE ai_sessions (
    id           SERIAL PRIMARY KEY,
    user_id      INT REFERENCES users(id) ON DELETE SET NULL,
    patient_id   INT REFERENCES patients(id) ON DELETE SET NULL,
    session_type VARCHAR(50)
                     CHECK (session_type IN ('diagnosis_assist','note_generation','drug_info','general')),
    started_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at     TIMESTAMP,
    status       VARCHAR(20) DEFAULT 'active'
                     CHECK (status IN ('active','completed','abandoned')),
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 31. AI_OUTPUTS
-- =============================================================
CREATE TABLE ai_outputs (
    id          SERIAL PRIMARY KEY,
    session_id  INT NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    output_type VARCHAR(50),
    content     TEXT NOT NULL,
    model_used  VARCHAR(100),
    tokens_used INT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 32. AI_TRANSCRIPTS
-- =============================================================
CREATE TABLE ai_transcripts (
    id         SERIAL PRIMARY KEY,
    session_id INT NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','system')),
    message    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 33. NOTIFICATIONS
-- =============================================================
CREATE TABLE notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      VARCHAR(200) NOT NULL,
    message    TEXT NOT NULL,
    type       VARCHAR(30)
                   CHECK (type IN ('appointment','lab_result','prescription','billing','system','alert')),
    is_read    BOOLEAN DEFAULT FALSE,
    read_at    TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- 34. AUDIT_LOGS
-- =============================================================
CREATE TABLE audit_logs (
    id         SERIAL PRIMARY KEY,
    user_id    INT REFERENCES users(id) ON DELETE SET NULL,
    action     VARCHAR(100) NOT NULL,
    table_name VARCHAR(100),
    record_id  INT,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================
-- UPDATED_AT TRIGGER (generic)
-- =============================================================
CREATE OR REPLACE FUNCTION fn_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated_at  BEFORE UPDATE ON organizations      FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_users_updated_at          BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_user_profiles_updated_at  BEFORE UPDATE ON user_profiles      FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_patients_updated_at       BEFORE UPDATE ON patients           FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_ins_prov_updated_at       BEFORE UPDATE ON insurance_providers FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_user_ins_updated_at       BEFORE UPDATE ON user_insurances    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_departments_updated_at    BEFORE UPDATE ON departments        FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_doctors_updated_at        BEFORE UPDATE ON doctors            FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_doc_sched_updated_at      BEFORE UPDATE ON doctor_schedules   FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_appointments_updated_at   BEFORE UPDATE ON appointments       FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_payments_updated_at       BEFORE UPDATE ON payments           FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_refunds_updated_at        BEFORE UPDATE ON payment_refunds    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_encounters_updated_at     BEFORE UPDATE ON encounters         FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_clinical_notes_updated_at BEFORE UPDATE ON clinical_notes     FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_prescriptions_updated_at  BEFORE UPDATE ON prescriptions      FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_inv_items_updated_at      BEFORE UPDATE ON inventory_items    FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_lab_orders_updated_at     BEFORE UPDATE ON lab_orders         FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_radio_orders_updated_at   BEFORE UPDATE ON radiology_orders   FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_sub_plans_updated_at      BEFORE UPDATE ON subscription_plans FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();
CREATE TRIGGER trg_user_subs_updated_at      BEFORE UPDATE ON user_subscriptions FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX idx_users_email            ON users(email);
CREATE INDEX idx_users_role_id          ON users(role_id);

CREATE INDEX idx_patients_code          ON patients(patient_code);
CREATE INDEX idx_patients_phone         ON patients(phone);
CREATE INDEX idx_patients_email         ON patients(email);

CREATE INDEX idx_appt_patient           ON appointments(patient_id);
CREATE INDEX idx_appt_doctor            ON appointments(doctor_id);
CREATE INDEX idx_appt_date              ON appointments(appointment_date);
CREATE INDEX idx_appt_status            ON appointments(status);

CREATE INDEX idx_payments_appointment   ON payments(appointment_id);
CREATE INDEX idx_payments_patient       ON payments(patient_id);

CREATE INDEX idx_encounters_patient     ON encounters(patient_id);
CREATE INDEX idx_encounters_doctor      ON encounters(doctor_id);
CREATE INDEX idx_encounters_date        ON encounters(encounter_date);
CREATE INDEX idx_encounters_appt        ON encounters(appointment_id);

CREATE INDEX idx_diagnoses_encounter    ON diagnoses(encounter_id);
CREATE INDEX idx_diagnoses_patient      ON diagnoses(patient_id);

CREATE INDEX idx_vitals_encounter       ON vitals(encounter_id);
CREATE INDEX idx_clinical_notes_enc     ON clinical_notes(encounter_id);

CREATE INDEX idx_prescriptions_patient  ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_enc      ON prescriptions(encounter_id);

CREATE INDEX idx_inv_items_org          ON inventory_items(organization_id);
CREATE INDEX idx_inv_trans_item         ON inventory_transactions(inventory_item_id);

CREATE INDEX idx_lab_orders_encounter   ON lab_orders(encounter_id);
CREATE INDEX idx_lab_orders_patient     ON lab_orders(patient_id);

CREATE INDEX idx_radio_orders_encounter ON radiology_orders(encounter_id);
CREATE INDEX idx_radio_orders_patient   ON radiology_orders(patient_id);

CREATE INDEX idx_notifications_user     ON notifications(user_id);
CREATE INDEX idx_notifications_read     ON notifications(is_read);

CREATE INDEX idx_ai_sessions_user       ON ai_sessions(user_id);
CREATE INDEX idx_ai_transcripts_session ON ai_transcripts(session_id);

CREATE INDEX idx_audit_user             ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at       ON audit_logs(created_at);
CREATE INDEX idx_audit_table            ON audit_logs(table_name);

-- =============================================================
-- 35. PASSWORD_RESET_TOKENS
-- =============================================================
CREATE TABLE password_reset_tokens (
    id         SERIAL PRIMARY KEY,
    user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code       CHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_prt_user_id ON password_reset_tokens(user_id);

-- =============================================================
-- 36. EMAIL_VERIFICATION_TOKENS (for registration OTP)
-- =============================================================
CREATE TABLE email_verification_tokens (
    id         SERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL,
    code       CHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_evt_email ON email_verification_tokens(email);

