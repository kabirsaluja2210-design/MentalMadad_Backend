package com.mentalmadad.dto.response;

import com.mentalmadad.entity.enums.AppointmentStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

/**
 * A booked (busy) time range on a doctor's calendar for a given date.
 *
 * Jackson serialization: LocalDate/LocalTime are serialized to ISO-8601
 * strings by Jackson's JavaTimeModule (auto-configured by Spring Boot).
 * The frontend uses these to render unavailable slots on its calendar.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AvailabilitySlot {

    private Long appointmentId;
    private Long doctorId;
    private LocalDate date;
    private LocalTime startTime;
    private LocalTime endTime;
    private AppointmentStatus status;
}
