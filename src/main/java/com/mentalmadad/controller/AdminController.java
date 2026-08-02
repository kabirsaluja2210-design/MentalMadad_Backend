package com.mentalmadad.controller;
import com.mentalmadad.dto.response.AdminStatsResponse; import com.mentalmadad.dto.response.AdminUserResponse; import com.mentalmadad.entity.enums.Role; import com.mentalmadad.service.AdminService; import io.swagger.v3.oas.annotations.Operation; import io.swagger.v3.oas.annotations.security.SecurityRequirement; import io.swagger.v3.oas.annotations.tags.Tag; import org.springframework.data.domain.Page; import org.springframework.security.access.prepost.PreAuthorize; import org.springframework.web.bind.annotation.*;
/**
 * Admin REST controller.
 *
 * Design Notes:
 * - ROLE CONTROL: method-level @PreAuthorize restricts every endpoint to
 *   ADMIN/SUPER_ADMIN (enabled by @EnableMethodSecurity in SecurityConfig);
 *   the SecurityConfig chain additionally requires authentication for
 *   /api/admin/**. A wrong-role caller gets 403 (AccessDeniedException is
 *   mapped to 403 by GlobalExceptionHandler); an anonymous caller gets 401.
 * - SOLID DIP: depends only on the AdminService interface.
 */
@RestController
@RequestMapping("/api/admin")
@Tag(name = "Admin", description = "Admin dashboard endpoints (ADMIN/SUPER_ADMIN only)")
public class AdminController {
    private final AdminService adminService;

    public AdminController(AdminService adminService) {
        this.adminService = adminService;
    }

    @GetMapping("/users")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    @Operation(summary = "List users (paginated, optional role filter)", security = @SecurityRequirement(name = "Bearer Authentication"))
    public Page<AdminUserResponse> users(
            @RequestParam(required = false) Role role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return adminService.listUsers(page, size, role);
    }

    @GetMapping("/stats")
    @PreAuthorize("hasAnyRole('ADMIN','SUPER_ADMIN')")
    @Operation(summary = "Platform statistics for the admin dashboard", security = @SecurityRequirement(name = "Bearer Authentication"))
    public AdminStatsResponse stats() {
        return adminService.getStats();
    }
}
