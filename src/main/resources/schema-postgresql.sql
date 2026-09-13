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

-- ============================================================
-- TrendPulse — daily trend analysis + subscriptions
-- Every column below must match the JPA entities exactly, because the
-- prod profile runs `ddl-auto: validate` after applying this script.
-- ============================================================

-- ------------------------------------------------------------
-- subscriptions — one row per user (missing row == FREE tier)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    id                       BIGSERIAL PRIMARY KEY,
    user_id                  BIGINT      NOT NULL,
    plan                     VARCHAR(20) NOT NULL,
    status                   VARCHAR(20) NOT NULL,
    current_period_end       TIMESTAMP,
    cancel_at_period_end     BOOLEAN     NOT NULL DEFAULT FALSE,
    provider_customer_id     VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    created_at               TIMESTAMP   NOT NULL,
    updated_at               TIMESTAMP   NOT NULL,
    CONSTRAINT uk_subscriptions_user UNIQUE (user_id),
    CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_sub
    ON subscriptions (provider_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_cus
    ON subscriptions (provider_customer_id);

-- ------------------------------------------------------------
-- usage_counters — per-user, per-day quota metering (UTC days)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usage_counters (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    usage_day   DATE   NOT NULL,
    query_count INT    NOT NULL DEFAULT 0,
    CONSTRAINT uk_usage_user_day UNIQUE (user_id, usage_day)
);

-- ------------------------------------------------------------
-- trend_snapshots — stored daily observations. This table is what makes
-- repeat queries fast: upstreams are hit once per term per day.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trend_snapshots (
    id           BIGSERIAL PRIMARY KEY,
    term_key     VARCHAR(160)     NOT NULL,
    display_term VARCHAR(160)     NOT NULL,
    geo          VARCHAR(16)      NOT NULL,
    observed_on  DATE             NOT NULL,
    raw_value    DOUBLE PRECISION NOT NULL,
    source       VARCHAR(40)      NOT NULL,
    fetched_at   TIMESTAMP        NOT NULL,
    CONSTRAINT uk_trend_snapshot_term_geo_day UNIQUE (term_key, geo, observed_on)
);

CREATE INDEX IF NOT EXISTS idx_trend_snapshot_lookup
    ON trend_snapshots (term_key, geo, observed_on);

-- ------------------------------------------------------------
-- tracked_terms — user watchlists (also the refresh job's warm set)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tracked_terms (
    id                BIGSERIAL PRIMARY KEY,
    user_id           BIGINT       NOT NULL,
    term_key          VARCHAR(160) NOT NULL,
    display_term      VARCHAR(160) NOT NULL,
    geo               VARCHAR(16)  NOT NULL,
    last_index_value  DOUBLE PRECISION,
    last_momentum_pct DOUBLE PRECISION,
    last_checked_at   TIMESTAMP,
    created_at        TIMESTAMP    NOT NULL,
    CONSTRAINT uk_tracked_user_term_geo UNIQUE (user_id, term_key, geo),
    CONSTRAINT fk_tracked_terms_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- trend_alerts — movements detected on watched terms (max one per day)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trend_alerts (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT           NOT NULL,
    term_key     VARCHAR(160)     NOT NULL,
    display_term VARCHAR(160)     NOT NULL,
    geo          VARCHAR(16)      NOT NULL,
    type         VARCHAR(20)      NOT NULL,
    z_score      DOUBLE PRECISION NOT NULL,
    change_pct   DOUBLE PRECISION NOT NULL,
    detected_on  DATE             NOT NULL,
    message      VARCHAR(500)     NOT NULL,
    read_flag    BOOLEAN          NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP        NOT NULL,
    CONSTRAINT uk_alert_user_term_day UNIQUE (user_id, term_key, geo, detected_on),
    CONSTRAINT fk_trend_alerts_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trend_alerts_user ON trend_alerts (user_id, detected_on);
