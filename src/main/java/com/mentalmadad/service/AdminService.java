package com.mentalmadad.service;
import com.mentalmadad.dto.response.AdminStatsResponse; import com.mentalmadad.dto.response.AdminUserResponse; import com.mentalmadad.entity.enums.Role; import org.springframework.data.domain.Page;
/**
 * Admin dashboard service.
 *
 * SOLID DIP: Controllers depend on this interface, never on the concrete
 * implementation. ISP: only admin operations are exposed here.
 */
public interface AdminService {
    /** Paginated user list; role filter is optional (null = all roles). Never exposes password material. */
    Page<AdminUserResponse> listUsers(int page, int size, Role role);
    /** Platform counts for the admin dashboard. */
    AdminStatsResponse getStats();
}
