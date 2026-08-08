# WorkMesh AI — Security Architecture & Guidelines

## 1. Authentication & Role-Based Access Control (RBAC)
- **Token Handling**: JWT Bearer tokens issued via `/api/v1/auth/login`. Tokens contain `sub` (User ID) and `role` (`ENGINEER`, `COMPANY`, `ADMIN`).
- **Server-Side Enforcement**: Never rely on frontend authorization alone. Every API route dependency enforces token validation and checks specific role requirements.
- **Admin Promotion Prevention**: Users cannot update their own `role` field. Role assignment is restricted during registration and system provisioning.

## 2. Authorization & IDOR Prevention
- **Ownership Validation**: Domain services enforce resource ownership checks (e.g., Engineer A cannot edit Engineer B's profile; Company A cannot view Company B's draft projects).
- **Public vs. Private Fields**: Private candidate data (email, phone, exact address) is stripped from public profile views.

## 3. Input Validation & AI Security
- **Untrusted User Inputs**: All user inputs (resumes, job requirements, project descriptions) are treated as untrusted. Sanitized using Pydantic validation schemas.
- **AI Prompt Injection**: System prompts explicitly separate instructions from user-provided content. AI model responses are parsed into structured JSON schemas via Pydantic models.
- **File Upload Security**: Uploaded files (resumes, logos) are validated by size, extension, and content type before being stored in MinIO with sanitized object keys.

## 4. Rate Limiting & API Defense
- **Middleware**: `RateLimitMiddleware` configured to prevent brute force attacks on `/auth/login` and excessive LLM API invocation abuse.
