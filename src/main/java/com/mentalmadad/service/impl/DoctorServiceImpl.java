package com.mentalmadad.service.impl;
import com.mentalmadad.dto.request.DoctorProfileUpdateRequest; import com.mentalmadad.dto.response.*; import com.mentalmadad.entity.Doctor; import com.mentalmadad.entity.User; import com.mentalmadad.exception.BadRequestException; import com.mentalmadad.exception.ResourceNotFoundException; import com.mentalmadad.repository.DoctorRepository; import com.mentalmadad.repository.UserRepository; import com.mentalmadad.service.DoctorService; import org.springframework.data.domain.*; import org.springframework.stereotype.Service; import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
/**
 * Doctor directory + provider self-service implementation.
 *
 * Design Notes:
 * - SOLID SRP: Owns all doctor business rules (search, detail, self-profile
 *   create-or-update). Controllers stay thin.
 * - Create-or-update (PUT /api/doctors/me): providers who registered through
 *   the app with role PSYCHOLOGIST/PSYCHIATRIST are not linked to a Doctor
 *   row at registration time. When they first save their profile we create
 *   the row on the fly (with a PENDING- license placeholder until an admin
 *   verifies their real license) so the provider dashboard works for newly
 *   registered users without an admin having to hand-create the record.
 * - SOLID OCP: partial updates apply only the non-null request fields, so the
 *   same method serves both "edit one field" and "full profile" clients.
 */
@Service public class DoctorServiceImpl implements DoctorService {
    private final DoctorRepository repo; private final UserRepository userRepo;
    public DoctorServiceImpl(DoctorRepository repo, UserRepository userRepo){this.repo=repo;this.userRepo=userRepo;}
    private DoctorResponse map(Doctor d){return DoctorResponse.builder().id(d.getId()).name(d.getUser().getFirstName()+" "+d.getUser().getLastName()).specialization(d.getSpecialization()).licenseNumber(d.getLicenseNumber()).yearsOfExperience(d.getYearsOfExperience()).consultationFee(d.getConsultationFee()).rating(d.getRating()).reviewCount(d.getReviewCount()).availableForChat(d.isAvailableForChat()).availableForVideo(d.isAvailableForVideo()).availableInPerson(d.isAvailableInPerson()).build();}
    private DoctorDetailResponse toDetail(Doctor d){return new DoctorDetailResponse(map(d),d.getAbout());}
    public Page<DoctorResponse> list(String s,String n,int p,int z){ PageRequest page=PageRequest.of(p,z); if ((s==null || s.isBlank()) && (n==null || n.isBlank())) return repo.findAll(page).map(this::map); return repo.search(s,n,page).map(this::map);} public DoctorDetailResponse get(Long id){Doctor d=repo.findById(id).orElseThrow(()->new ResourceNotFoundException("Doctor","id",id)); return toDetail(d);}
    @Override @Transactional(readOnly = true)
    public DoctorDetailResponse getMe(Long userId){
        Doctor d=repo.findByUserId(userId).orElseThrow(()->new ResourceNotFoundException("Doctor profile","userId",userId));
        return toDetail(d);
    }
    @Override @Transactional
    public DoctorDetailResponse updateMe(Long userId, DoctorProfileUpdateRequest request){
        if (request.getConsultationFee()!=null && request.getConsultationFee().signum()<0)
            throw new BadRequestException("consultationFee must be greater than or equal to 0");
        User user=userRepo.findById(userId).orElseThrow(()->new ResourceNotFoundException("User","id",userId));
        Doctor doctor=repo.findByUserId(userId).orElseGet(()->{
            if (request.getSpecialization()==null || request.getSpecialization().isBlank())
                throw new BadRequestException("specialization is required when creating a doctor profile");
            return Doctor.builder()
                    .user(user)
                    .specialization(request.getSpecialization().trim())
                    .licenseNumber("PENDING-"+userId) // placeholder until admin verifies a real license (column is non-null + unique)
                    .yearsOfExperience(request.getYearsOfExperience()!=null?request.getYearsOfExperience():0)
                    .consultationFee(request.getConsultationFee()!=null?request.getConsultationFee():BigDecimal.ZERO)
                    .about(request.getAbout())
                    .build();
        });
        if (request.getAbout()!=null) doctor.setAbout(request.getAbout());
        if (request.getConsultationFee()!=null) doctor.setConsultationFee(request.getConsultationFee());
        if (request.getAvailableForChat()!=null) doctor.setAvailableForChat(request.getAvailableForChat());
        if (request.getAvailableForVideo()!=null) doctor.setAvailableForVideo(request.getAvailableForVideo());
        if (request.getAvailableInPerson()!=null) doctor.setAvailableInPerson(request.getAvailableInPerson());
        if (request.getYearsOfExperience()!=null) doctor.setYearsOfExperience(request.getYearsOfExperience());
        if (request.getSpecialization()!=null && !request.getSpecialization().isBlank()) doctor.setSpecialization(request.getSpecialization().trim());
        return toDetail(repo.save(doctor));
    }
}
