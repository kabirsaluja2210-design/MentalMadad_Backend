package com.mentalmadad.exception;

/**
 * Custom exception for resource-not-found scenarios (404).
 * Used when a requested entity (User, etc.) does not exist in the database.
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public ResourceNotFoundException(String resource, String field, Object value) {
        super(String.format("%s not found with %s: '%s'", resource, field, value));
    }
}
