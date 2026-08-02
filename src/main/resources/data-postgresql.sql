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
