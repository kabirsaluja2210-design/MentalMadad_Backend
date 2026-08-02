# MentalMadad Backend

Spring Boot REST API for the MentalMadad mental health platform MVP.

## Tech Stack

- **Java 17+** with **Spring Boot 3.2.x**
- **Spring Security** + JWT authentication
- **Spring Data JPA** + H2 (dev) / PostgreSQL (prod)
- **Swagger/OpenAPI** for API documentation
- **Maven** for build management

## Quick Start

```bash
# From the backend directory
cd /home/team/shared/backend

# Compile and run tests
mvn clean package

# Start the server (port 8080) — default profile = H2 in-memory
mvn spring-boot:run
```

The server starts on **http://localhost:8080**.

## Database Profiles

The application uses Spring profiles to switch databases:

| Profile   | Database                        | When to use                    |
|-----------|---------------------------------|--------------------------------|
| `default` | H2 in-memory (`jdbc:h2:mem:...`) | Local development (no setup) |
| `prod`    | PostgreSQL                      | Production / staging          |

The `default` profile is active automatically — run `mvn spring-boot:run` and you
get H2 with seed data and SQL logging, no configuration required.

### Running locally with H2 (default)

```bash
mvn spring-boot:run
```

- H2 console: **http://localhost:8080/h2-console**
  - JDBC URL: `jdbc:h2:mem:mentalmadad`, username `sa`, empty password
- Seed data from `src/main/resources/data.sql` loads on every start
- Schema is recreated each boot (`ddl-auto: create-drop`)

### Running with PostgreSQL (production)

```bash
mvn spring-boot:run --spring.profiles.active=prod
# or
SPRING_PROFILES_ACTIVE=prod mvn spring-boot:run
```

On startup the `prod` profile:
1. Applies `schema-postgresql.sql` (creates `users` + `refresh_tokens` tables)
2. Loads `data-postgresql.sql` (idempotent seed users)
3. Runs Hibernate with `ddl-auto: validate` — fails fast if the schema
   doesn't match the JPA entities

### Required environment variables (prod)

The `prod` profile is configured entirely from environment variables:

| Variable        | Default     | Description                                  |
|-----------------|-------------|----------------------------------------------|
| `DATABASE_URL`  | *(see below)* | Full JDBC URL, e.g. `jdbc:postgresql://host:5432/db` |
| `DB_HOST`       | `localhost` | PostgreSQL host (used when `DATABASE_URL` is unset) |
| `DB_PORT`       | `5432`      | PostgreSQL port                               |
| `DB_NAME`       | `mentalmadad` | Database name                               |
| `DB_USER`       | `postgres`  | Database user                                |
| `DB_PASSWORD`   | `postgres`  | Database password                            |
| `APP_JWT_SECRET`| dev secret  | **Override in production!** JWT signing key   |

Two connection styles are supported:

```bash
# Style 1 — full JDBC URL (e.g. managed providers like Neon)
export DATABASE_URL="jdbc:postgresql://your-host:5432/mentalmadad"
export DB_USER="your-user"
export DB_PASSWORD="your-password"
export APP_JWT_SECRET="$(openssl rand -base64 48)"

# Style 2 — individual parts
export DB_HOST="your-host" DB_PORT="5432" DB_NAME="mentalmadad"
export DB_USER="your-user" DB_PASSWORD="your-password"
export APP_JWT_SECRET="$(openssl rand -base64 48)"

mvn spring-boot:run --spring.profiles.active=prod
```

> Note: `DATABASE_URL` must be a JDBC URL (`jdbc:postgresql://...`). If your
> provider gives a `postgres://...` URL, convert it or use the individual
> `DB_*` variables instead.
>
> The pool uses HikariCP (Spring Boot's default). Pool sizing is set in
> `application-prod.yml` (`maximum-pool-size`, `minimum-idle`, etc.) and can
> be overridden with `SPRING_DATASOURCE_HIKARI_*` environment variables.

### Building with the prod profile (no database required)

```bash
# Compiles and runs the test suite with the prod config loaded
# (tests are slice/unit tests — they don't need a live database)
mvn clean package -Dspring.profiles.active=prod
```

## Deployment (AWS App Runner + managed PostgreSQL)

The repo ships a multi-stage `Dockerfile` (Maven build → lean JRE runtime,
non-root user) and an `apprunner.yaml` that declares the intended App Runner
service configuration.

### 1. Build the image

```bash
docker build -t mentalmadad-backend:0.1.0 .
```

The image listens on `$PORT` (default `8080` — `server.port: ${PORT:8080}` in
`application.yml`), so the platform can inject the port it routes to.

### 2. Push to Amazon ECR

```bash
aws ecr get-login-password --region <region> | docker login --username AWS \
  --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
docker tag mentalmadad-backend:0.1.0 \
  <account-id>.dkr.ecr.<region>.amazonaws.com/mentalmadad-backend:0.1.0
docker push <account-id>.dkr.ecr.<region>.amazonaws.com/mentalmadad-backend:0.1.0
```

### 3. Create the App Runner service

Create a service from the ECR image (console: **Create service → Container
registry → Amazon ECR**; or `aws apprunner create-service` with an
`ImageRepository` source). Apply the settings below.

> Note: App Runner reads `apprunner.yaml` only for source-code-based
> services. For an ECR-image service the file is ignored, so the same values
> must be entered when creating/updating the service — treat `apprunner.yaml`
> as the declarative reference and keep it in sync.

- **Port:** `8080`
- **Health check:** `TCP` on port `8080`, interval 5s, timeout 2s, healthy
  threshold 1, unhealthy threshold 5. (Spring Boot Actuator is not on the
  classpath, so there is no `/actuator/health` HTTP endpoint — a TCP
  connection check is the right probe.)
- **Environment variables:**

  | Variable | Value | Notes |
  |----------|-------|-------|
  | `SPRING_PROFILES_ACTIVE` | `prod` | Activates the PostgreSQL profile |
  | `DATABASE_URL` | *your JDBC URL* | Must be a `jdbc:postgresql://...` URL (see below) |
  | `APP_JWT_SECRET` | *random value* | Strong random secret, e.g. `openssl rand -base64 48` |
  | `PORT` | *(auto)* | **Reserved by App Runner** — do not set it; App Runner injects it with the service port. The app binds to it via `${PORT:8080}`. |

  **`DATABASE_URL` format:** the prod profile expects a JDBC URL, e.g.
  `jdbc:postgresql://HOST:5432/mentalmadad?sslmode=require`. If your managed
  PostgreSQL provider gives a `postgres://...` URL, convert it to
  `jdbc:postgresql://...`. Alternatively, omit `DATABASE_URL` and set the
  `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` fallbacks the
  profile already supports (see `application-prod.yml`). Prefer storing
  `DATABASE_URL` / `APP_JWT_SECRET` / `DB_PASSWORD` in AWS Secrets Manager
  and referencing them (App Runner supports `secrets` in `apprunner.yaml`).

  **`APP_JWT_SECRET`:** must be a strong random value (≥ 256 bits for HS256)
  — never reuse the dev default from `application.yml`. Generate with
  `openssl rand -base64 48`. Rotating it invalidates all issued tokens.

### 4. Deploy

- Manual: **Deploy → Deploy from image** in the App Runner console.
- Automatic: enable **auto-deploy on image push** at service creation so
  every `docker push` to the ECR repo triggers a deployment.

The container runs as the non-root `appuser` (uid 1000). Instance size:
start with 0.25 vCPU / 512 MB (the JVM sizes its heap from the container
memory limit via `-XX:MaxRAMPercentage=75.0`).

## Swagger UI

Once running, open: **http://localhost:8080/swagger-ui.html**

## H2 Console

Dev database console: **http://localhost:8080/h2-console**

- JDBC URL: `jdbc:h2:mem:mentalmadad`
- Username: `sa`
- Password: *(empty)*

## API Endpoints

### Authentication (public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, get JWT tokens |
| POST | `/api/auth/refresh` | Refresh access token |

### Users (authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/me` | Get current user profile |

### Testing with curl

```bash
# Register a new patient
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@test.com","password":"password123","firstName":"Test","lastName":"User"}'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"patient@test.com","password":"password123"}'

# Get current user (replace TOKEN with the access token from login)
curl http://localhost:8080/api/users/me \
  -H "Authorization: Bearer TOKEN"

# Refresh token
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

### Seed Users (password for all: `password123`)

| Email | Role |
|-------|------|
| admin@mentalmadad.com | ADMIN |
| patient@test.com | PATIENT |
| psychologist@test.com | PSYCHOLOGIST |
| psychiatrist@test.com | PSYCHIATRIST |
| ngo@test.com | NGO |
| volunteer@test.com | VOLUNTEER |

## Project Structure (Clean Architecture)

```
backend/
  src/main/java/com/mentalmadad/
    config/          # CORS, Security, Swagger configuration
    controller/      # REST controllers (presentation layer)
    dto/             # Data Transfer Objects (request/response)
      request/       # Incoming request DTOs
      response/      # Outgoing response DTOs
    entity/          # JPA entities (domain model)
      enums/         # Enum types
    exception/       # Custom exceptions + global handler
    repository/      # Spring Data JPA repositories
    security/        # JWT provider, filters, UserDetails
    service/         # Business logic interfaces
      impl/          # Service implementations
    mapper/          # Entity <-> DTO mappers
  src/main/resources/
    application.yml        # Common config + default (H2 dev) profile
    application-prod.yml   # prod profile: PostgreSQL via env vars
    data.sql               # Seed data for development (H2)
    schema-postgresql.sql  # PostgreSQL schema (prod)
    data-postgresql.sql    # PostgreSQL seed data (prod, idempotent)
  src/test/java/     # Unit and integration tests
```

## SOLID Patterns (Where and Why)

### Single Responsibility Principle (SRP)
- **AuthServiceImpl** — only authentication logic (register, login, refresh)
- **UserServiceImpl** — only user profile operations
- **JwtProvider** — only JWT token operations (generate, validate, parse)
- **GlobalExceptionHandler** — only exception-to-response mapping
- **UserMapper** — only entity-to-DTO conversion

### Open/Closed Principle (OCP)
- **AuthService interface**: New auth strategies (OAuth2, SSO) can be added by implementing this interface — existing code doesn't change.
- **SecurityConfig**: New public endpoints can be added to the `permitAll()` list without modifying filter logic.

### Liskov Substitution Principle (LSP)
- All service implementations can be substituted for their interfaces (`AuthService`, `UserService`).
- `CustomUserDetails` extends `UserDetails` and can be used anywhere Spring Security expects a `UserDetails`.

### Interface Segregation Principle (ISP)
- **AuthService** — auth-specific methods only (register, login, refresh)
- **UserService** — user-specific methods only (getCurrentUser)
- Clients don't depend on methods they don't use.

### Dependency Inversion Principle (DIP)
- **Controllers** depend on service interfaces (`AuthService`, `UserService`), not implementations.
- **ServiceImpls** depend on repository interfaces (abstractions), not concrete JPA implementations.
- Spring's IoC container injects concrete implementations at runtime.

## GoF Design Patterns (Where and Why)

| Pattern | Where | Why |
|---------|-------|-----|
| **Singleton** | All `@Service`, `@Repository`, `@Controller`, `@Component` beans | Spring's default bean scope — one instance per container |
| **Factory Method** | `AuthServiceImpl.createUser()` | Centralizes User creation with role-specific initialization |
| **Builder** | All DTOs and entities via Lombok `@Builder` | Fluent object construction without telescoping constructors |
| **Strategy** | `PasswordEncoder` (BCrypt), `AuthenticationManager` | Swap hashing algorithms or auth strategies without code changes |
| **Chain of Responsibility** | Spring Security filter chain (`JwtAuthenticationFilter`, etc.) | Each filter processes the request sequentially; can pass or short-circuit |
| **Template Method** | `AuthenticationManager.authenticate()` | Defines auth steps; providers fill in the specifics |
| **Facade** | `AuthServiceImpl` (facade over JwtProvider, PasswordEncoder, UserRepository, UserMapper) | Simplifies controller code — one call instead of orchestrating 4 components |
| **Proxy** | `@Transactional` on service methods | Spring creates a proxy that manages transaction boundaries transparently |
| **Decorator** | Spring Security's filter chain | Each filter decorates/wraps the request with additional security context |
| **Observer** | Spring Event Publisher (`ApplicationEventPublisher`) | Placeholder for auth events (login success, registration, etc.) |

## Jackson Serialization / Deserialization

### Serialization (Entity/DTO → JSON)
- **User entity → JSON response**: `UserResponse` is serialized by `@RestController` via Spring's `HttpMessageConverter`
- `@JsonIgnore` on `User.password` — never included in responses
- `@JsonProperty` on entity and DTO fields — controls JSON key names (e.g., `firstName`, `createdAt`)
- `@JsonFormat` on `createdAt`/`updatedAt` — ISO 8601 format (`yyyy-MM-dd'T'HH:mm:ss`)
- `@JsonInclude(NON_NULL)` on `ErrorResponse` — omits null fields (e.g., `errors` map when empty)

### Deserialization (JSON → DTO)
- `@RequestBody` in controllers triggers Jackson to deserialize JSON into `RegisterRequest`, `LoginRequest`, `RefreshTokenRequest`
- Validation via `@Valid` + `jakarta.validation` annotations (`@NotBlank`, `@Email`, `@Size`)
- Controllers never receive raw JSON strings — Jackson handles conversion transparently

## Running Tests

```bash
# Run all tests
mvn test

# Run specific test class
mvn test -Dtest=AuthServiceTest

# Run tests with coverage (if JaCoCo configured)
mvn test jacoco:report
```
