-- ============================================================
-- MentalMadad — PostgreSQL Schema (production profile)
--
-- Applied by spring.sql.init in the `prod` profile BEFORE Hibernate
-- runs `ddl-auto: validate`, so every column below must match the JPA
-- entities exactly (see com.mentalmadad.entity.User).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS makes repeated startups safe.
-- ============================================================

-- ------------------------------------------------------------
-- users — core account table
--
-- Matches the User entity:
--   id            Long (GenerationType.IDENTITY) -> BIGSERIAL
--   email         @Column(nullable=false, unique=true, length=255)
--   password      @Column(nullable=false) — BCrypt hash
--   first_name    @Column(nullable=false, length=100)
--   last_name     @Column(nullable=false, length=100)
--   role          @Enumerated(STRING), @Column(nullable=false, length=20)
--   phone_number  @Column(length=20) — nullable
--   email_verified @Column(nullable=false) — boolean
--   created_at    @CreationTimestamp, nullable=false
--   updated_at    @UpdateTimestamp, nullable=false
-- ------------------------------------------------------------
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

-- Common lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users (role);

-- ------------------------------------------------------------
-- refresh_tokens — issued refresh tokens for JWT rotation.
--
-- No JPA entity exists yet; the table is ready for the upcoming
-- token persistence module. Extra tables are ignored by
-- `ddl-auto: validate` (it only checks mapped entities).
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
