-- Seed data for MentalMadad development
-- Passwords are bcrypt-encoded: "password123"
-- Generated with: Spring Security's BCryptPasswordEncoder

-- Insert default users for testing
-- Password for all: password123
INSERT INTO users (email, password, first_name, last_name, role, phone_number, email_verified, created_at, updated_at)
VALUES
('admin@mentalmadad.com', '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'System', 'Admin', 'ADMIN', '+1234567890', true, NOW(), NOW()),
('patient@test.com', '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'John', 'Doe', 'PATIENT', '+1234567891', true, NOW(), NOW()),
('psychologist@test.com', '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Jane', 'Smith', 'PSYCHOLOGIST', '+1234567892', true, NOW(), NOW()),
('psychiatrist@test.com', '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Robert', 'Johnson', 'PSYCHIATRIST', '+1234567893', true, NOW(), NOW()),
('ngo@test.com', '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Hope', 'Foundation', 'NGO', '+1234567894', true, NOW(), NOW()),
('volunteer@test.com', '$2a$10$sMKnyDkIf7rtvEoSCOp/wugfoXo0LrGdc35iltWWCT.fSFIN.1v1.', 'Alice', 'Williams', 'VOLUNTEER', '+1234567895', true, NOW(), NOW());

-- ------------------------------------------------------------------
-- Doctor profiles for the seeded provider users
-- (psychologist@test.com = Jane Smith, psychiatrist@test.com = Robert Johnson)
-- user_id is resolved by email subquery so the seed is independent of the
-- auto-assigned id order. license_number is unique per doctor.
-- ------------------------------------------------------------------
INSERT INTO doctors (user_id, specialization, license_number, years_of_experience, consultation_fee, about, available_for_chat, available_for_video, available_in_person, rating, review_count, created_at, updated_at)
SELECT id, 'Clinical Psychology', 'LIC-PSY-1001', 8, 1500.00,
       'Dr. Jane Smith is a licensed clinical psychologist with 8 years of experience helping adults and adolescents with anxiety, depression, and stress management. She offers evidence-based therapy (CBT, ACT) in a warm, non-judgmental space.',
       TRUE, TRUE, TRUE, 4.8, 42, NOW(), NOW()
FROM users WHERE email = 'psychologist@test.com';

INSERT INTO doctors (user_id, specialization, license_number, years_of_experience, consultation_fee, about, available_for_chat, available_for_video, available_in_person, rating, review_count, created_at, updated_at)
SELECT id, 'Psychiatry', 'LIC-PSY-2001', 12, 2500.00,
       'Dr. Robert Johnson is a board-certified psychiatrist with 12 years of experience in adult psychiatry, mood disorders, and medication management. He combines medication management with psychotherapy for comprehensive care.',
       TRUE, TRUE, FALSE, 4.9, 87, NOW(), NOW()
FROM users WHERE email = 'psychiatrist@test.com';
