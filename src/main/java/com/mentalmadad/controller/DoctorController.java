package com.mentalmadad.controller;
import com.mentalmadad.dto.request.DoctorProfileUpdateRequest; import com.mentalmadad.dto.response.*; import com.mentalmadad.security.CustomUserDetails; import com.mentalmadad.service.DoctorService; import io.swagger.v3.oas.annotations.Operation; import io.swagger.v3.oas.annotations.security.SecurityRequirement; import org.springframework.data.domain.*; import org.springframework.security.access.prepost.PreAuthorize; import org.springframework.security.core.Authentication; import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/doctors")
public class DoctorController {
    private final DoctorService service; public DoctorController(DoctorService s){service=s;}
    private Long currentUserId(Authentication authentication){return ((CustomUserDetails) authentication.getPrincipal()).getId();}
    @GetMapping public Page<DoctorResponse> list(@RequestParam(required=false) String specialization,@RequestParam(required=false) String name,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size){return service.list(specialization,name,page,size);}
    @GetMapping("/search") public Page<DoctorResponse> search(@RequestParam(required=false) String specialization,@RequestParam(required=false) String name,@RequestParam(defaultValue="0") int page,@RequestParam(defaultValue="12") int size){return service.list(specialization,name,page,size);}
    @GetMapping("/{id}") public DoctorDetailResponse get(@PathVariable Long id){return service.get(id);}
    @GetMapping("/me")
    @PreAuthorize("hasAnyRole('PSYCHOLOGIST','PSYCHIATRIST')")
    @Operation(summary = "Get the authenticated doctor's own full profile", security = @SecurityRequirement(name = "Bearer Authentication"))
    public DoctorDetailResponse getMe(Authentication authentication){return service.getMe(currentUserId(authentication));}
    @PutMapping("/me")
    @PreAuthorize("hasAnyRole('PSYCHOLOGIST','PSYCHIATRIST')")
    @Operation(summary = "Create or update the authenticated doctor's own profile", security = @SecurityRequirement(name = "Bearer Authentication"))
    public DoctorDetailResponse updateMe(Authentication authentication,@RequestBody DoctorProfileUpdateRequest request){return service.updateMe(currentUserId(authentication),request);}
}
