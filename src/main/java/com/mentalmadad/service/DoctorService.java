package com.mentalmadad.service;
import com.mentalmadad.dto.response.*; import org.springframework.data.domain.*;
public interface DoctorService { Page<DoctorResponse> list(String specialization,String name,int page,int size); DoctorDetailResponse get(Long id); }
