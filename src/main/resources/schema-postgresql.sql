-- ============================================================
-- MentalMadad — PostgreSQL Schema (production profile)
-- Applied by spring.sql.init in the `prod` profile BEFORE Hibernate
-- runs `ddl-auto: validate`, so every column below must match the JPA
-- entities exactly. Idempotent: CREATE TABLE IF NOT EXISTS.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id             BIGSERIAL PRIMARY KEY,
    email          VARCHAR(255) NOT NULL,
    password       VARCHAR(255) NOT NULL,
    first_name     VARCHAR(100) NOT NULL,
    last_name      VARCHAR(100) NOT NULL,
    role           VARCHAR(20)  NOT NULL,
    phone_number   VARCHAR(20),
    email_verified BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP    NOT NULL,
    updated_at     TIMESTAMP    NOT NULL,
    CONSTRAINT uk_users_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);

-- ------------------------------------------------------------
-- doctors — provider profiles (PSYCHOLOGIST / PSYCHIATRIST users)
-- Matches the Doctor entity (user_id OneToOne unique, license unique).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT         NOT NULL,
    specialization      VARCHAR(255)   NOT NULL,
    license_number      VARCHAR(255)   NOT NULL,
    years_of_experience INT            NOT NULL,
    consultation_fee    NUMERIC(10, 2) NOT NULL,
    about               TEXT,
    available_for_chat  BOOLEAN        NOT NULL DEFAULT TRUE,
    available_for_video BOOLEAN        NOT NULL DEFAULT TRUE,
    available_in_person BOOLEAN        NOT NULL DEFAULT FALSE,
    rating              DOUBLE PRECISION NOT NULL DEFAULT 0,
    review_count        INT            NOT NULL DEFAULT 0,
    created_at          TIMESTAMP      NOT NULL,
    updated_at          TIMESTAMP      NOT NULL,
    CONSTRAINT uk_doctors_user_id      UNIQUE (user_id),
    CONSTRAINT uk_doctors_license_no   UNIQUE (license_number),
    CONSTRAINT fk_doctors_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_doctors_specialization ON doctors (specialization);

-- ------------------------------------------------------------
-- appointments — booked sessions between patients and doctors
-- Matches the Appointment entity.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id               BIGSERIAL PRIMARY KEY,
    patient_id       BIGINT      NOT NULL,
    doctor_id        BIGINT      NOT NULL,
    appointment_date DATE        NOT NULL,
    start_time       TIME        NOT NULL,
    end_time         TIME        NOT NULL,
    type             VARCHAR(20) NOT NULL,
    status           VARCHAR(20) NOT NULL,
    notes            TEXT,
    created_at       TIMESTAMP,
    updated_at       TIMESTAMP,
    CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id)
        REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_appointments_doctor FOREIGN KEY (doctor_id)
        REFERENCES doctors (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments (patient_id, appointment_date, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id  ON appointments (doctor_id, appointment_date, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_status     ON appointments (status);

-- ------------------------------------------------------------
-- refresh_tokens — issued refresh tokens for JWT rotation.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT    NOT NULL,
    token       TEXT      NOT NULL,
    expiry_date TIMESTAMP NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_refresh_tokens_token UNIQUE (token),
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);
