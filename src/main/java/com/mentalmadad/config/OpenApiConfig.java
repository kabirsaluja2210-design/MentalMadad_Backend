package com.mentalmadad.config;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * OpenAPI / Swagger configuration.
 *
 * Swagger UI is available at /swagger-ui.html.
 * OpenAPI JSON spec at /api-docs.
 *
 * Design Notes:
 * - GoF Singleton: @Bean methods produce singleton beans.
 * - Configures JWT Bearer auth for the "Try it out" feature in Swagger UI.
 */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI mentalMadadOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("MentalMadad API")
                        .description("Secure AI-powered mental health platform REST API. "
                                + "Provides authentication, user management, and appointment booking.")
                        .version("0.1.0")
                        .contact(new Contact()
                                .name("MentalMadad Team")
                                .email("team@mentalmadad.com"))
                        .license(new License()
                                .name("Proprietary")
                                .url("https://mentalmadad.com")))
                .components(new Components()
                        .addSecuritySchemes("Bearer Authentication",
                                new SecurityScheme()
                                        .type(SecurityScheme.Type.HTTP)
                                        .scheme("bearer")
                                        .bearerFormat("JWT")
                                        .description("Enter your JWT token obtained from /api/auth/login")));
    }
}
