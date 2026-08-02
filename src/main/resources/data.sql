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
