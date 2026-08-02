package com.mentalmadad.entity.enums;

/**
 * User roles for the MentalMadad platform.
 *
 * PATIENT       - End user seeking mental health services
 * PSYCHOLOGIST  - Licensed psychologist provider
 * PSYCHIATRIST  - Licensed psychiatrist (can prescribe medication)
 * NGO           - Non-governmental organization providing mental health resources
 * VOLUNTEER     - Verified volunteer offering peer support
 * ADMIN         - Platform administrator
 * SUPER_ADMIN   - Super administrator with full system access
 */
public enum Role {
    PATIENT,
    PSYCHOLOGIST,
    PSYCHIATRIST,
    NGO,
    VOLUNTEER,
    ADMIN,
    SUPER_ADMIN
}
