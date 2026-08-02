package com.mentalmadad;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * MentalMadad Backend Application - Entry Point.
 *
 * Design Note (GoF - Singleton):
 * Spring Boot's @SpringBootApplication annotation, combined with the default
 * bean scope (singleton), ensures all @Service, @Repository, @Controller, and
 * @Component beans are singletons within the ApplicationContext. This follows
 * the GoF Singleton pattern — one shared instance per Spring container.
 */
@SpringBootApplication
public class MentalMadadApplication {

    public static void main(String[] args) {
        SpringApplication.run(MentalMadadApplication.class, args);
    }
}
