-- ============================================================
-- MentalMadad — PostgreSQL Seed Data (production profile)
--
-- Same 6 seed users as the H2 dev data.sql.
-- Passwords are BCrypt hashes of "password123":
--   $2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.
--
-- Idempotent: ON CONFLICT (email) DO NOTHING lets the script run
-- on every startup without duplicating rows or erroring on
-- already-seeded databases.
-- ============================================================

INSERT INTO users (email, password, first_name, last_name, role, phone_number, email_verified, created_at, updated_at)
VALUES
('admin@mentalmadad.com',       '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'System',  'Admin',     'ADMIN',       '+1234567890', TRUE,  NOW(), NOW()),
('patient@test.com',            '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'John',    'Doe',       'PATIENT',     '+1234567891', TRUE,  NOW(), NOW()),
('psychologist@test.com',       '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Jane',    'Smith',     'PSYCHOLOGIST','+1234567892', TRUE,  NOW(), NOW()),
('psychiatrist@test.com',       '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Robert',  'Johnson',   'PSYCHIATRIST', '+1234567893', TRUE,  NOW(), NOW()),
('ngo@test.com',                '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Hope',    'Foundation', 'NGO',         '+1234567894', TRUE,  NOW(), NOW()),
('volunteer@test.com',          '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Alice',   'Williams',   'VOLUNTEER',   '+1234567895', TRUE,  NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

-- ------------------------------------------------------------------
-- Doctor profiles for the seeded provider users
-- Idempotent: INSERT ... SELECT ... ON CONFLICT (license_number) DO NOTHING
-- ------------------------------------------------------------------
INSERT INTO doctors (user_id, specialization, license_number, years_of_experience, consultation_fee, about, available_for_chat, available_for_video, available_in_person, rating, review_count, created_at, updated_at)
SELECT id, 'Clinical Psychology', 'LIC-PSY-1001', 8, 1500.00,
       'Dr. Jane Smith is a licensed clinical psychologist with 8 years of experience helping adults and adolescents with anxiety, depression, and stress management. She offers evidence-based therapy (CBT, ACT) in a warm, non-judgmental space.',
       TRUE, TRUE, TRUE, 4.8, 42, NOW(), NOW()
FROM users WHERE email = 'psychologist@test.com'
ON CONFLICT (license_number) DO NOTHING;

INSERT INTO doctors (user_id, specialization, license_number, years_of_experience, consultation_fee, about, available_for_chat, available_for_video, available_in_person, rating, review_count, created_at, updated_at)
SELECT id, 'Psychiatry', 'LIC-PSY-2001', 12, 2500.00,
       'Dr. Robert Johnson is a board-certified psychiatrist with 12 years of experience in adult psychiatry, mood disorders, and medication management. He combines medication management with psychotherapy for comprehensive care.',
       TRUE, TRUE, FALSE, 4.9, 87, NOW(), NOW()
FROM users WHERE email = 'psychiatrist@test.com'
ON CONFLICT (license_number) DO NOTHING;

-- ------------------------------------------------------------------
-- TrendPulse: every existing account starts on the FREE tier. Paid tiers
-- are granted only by a verified payment-provider event, never by seed data.
-- Idempotent: ON CONFLICT keeps repeat boots from failing.
-- ------------------------------------------------------------------
INSERT INTO subscriptions (user_id, plan, status, cancel_at_period_end, created_at, updated_at)
SELECT id, 'FREE', 'ACTIVE', FALSE, NOW(), NOW() FROM users
ON CONFLICT (user_id) DO NOTHING;
