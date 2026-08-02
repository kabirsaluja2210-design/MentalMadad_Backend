package com.mentalmadad.exception;

/**
 * Custom exception for bad request scenarios (400).
 * Used for invalid input, duplicate emails, etc.
 */
public class BadRequestException extends RuntimeException {

    public BadRequestException(String message) {
        super(message);
    }
}
