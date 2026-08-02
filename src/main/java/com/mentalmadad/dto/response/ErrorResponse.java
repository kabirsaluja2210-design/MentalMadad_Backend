package com.mentalmadad.dto.response;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * Standard error response DTO for the global exception handler.
 *
 * Jackson serialization:
 * - @JsonInclude(JsonInclude.Include.NON_NULL) — validation errors map
 *   is only included when there are field-level errors to report
 * - @JsonFormat on timestamp for ISO 8601
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ErrorResponse {

    private int status;

    private String error;

    private String message;

    @JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd'T'HH:mm:ss")
    @Builder.Default
    private LocalDateTime timestamp = LocalDateTime.now();

    private String path;

    /**
     * Field-level validation errors. Key = field name, Value = error message.
     * Only included when there are validation errors (NON_NULL).
     */
    private Map<String, String> errors;
}
