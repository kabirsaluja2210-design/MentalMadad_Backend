# syntax=docker/dockerfile:1
# ============================================================
# MentalMadad Backend — multi-stage production image
#
#   Stage 1 (builder): compiles the Spring Boot app with Maven + JDK 17.
#   Stage 2 (runtime): lean JRE image with only the bootable jar —
#                      no build tooling, no sources.
#
# The app listens on $PORT (default 8080, see src/main/resources/
# application.yml: `server.port: ${PORT:8080}`).
# ============================================================

# ---------- Stage 1: build ----------
FROM maven:3.9-eclipse-temurin-17 AS builder

# Cap Maven's JVM heap so the build fits on memory-constrained hosts.
ENV MAVEN_OPTS="-Xmx1g"

WORKDIR /build

# Resolve dependencies first so they layer-cache independently of source changes.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

# Copy sources and package the bootable jar (tests run in CI separately).
COPY src ./src
RUN mvn -B -q package -DskipTests

# ---------- Stage 2: runtime ----------
FROM eclipse-temurin:17-jre

# Run as a non-root user (uid/gid 1000, the conventional first user).
RUN groupadd --system --gid 1000 appuser \
    && useradd --system --uid 1000 --gid appuser -m appuser

WORKDIR /app

# The bootable Spring Boot jar from the builder stage (fat jar incl. Tomcat).
COPY --from=builder /build/target/mentalmadad-backend-0.1.0-SNAPSHOT.jar /app/app.jar

USER appuser

# Default port for local `docker run -p 8080:8080`. In App Runner / ECS the
# platform injects its own PORT env var, which overrides this value.
ENV PORT=8080

# EXPOSE is informational (the app binds to $PORT, default 8080).
EXPOSE 8080

# MaxRAMPercentage lets the JVM size its heap from the container memory limit
# (important on App Runner, which enforces a memory cap per instance).
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
