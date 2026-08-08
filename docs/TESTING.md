# WorkMesh AI — Testing & Quality Assurance Guide

This document outlines the testing strategy, test suites, and execution instructions for the WorkMesh AI platform.

---

## 1. Test Architecture Overview

```
                               ┌───────────────────────────┐
                               │   End-to-End User Flows   │
                               │  Playwright / E2E Scripts │
                               └─────────────┬─────────────┘
                                             │
                               ┌─────────────┴─────────────┐
                               │   Integration API Tests   │
                               │  Pytest Async HTTP Client │
                               └─────────────┬─────────────┘
                                             │
                               ┌─────────────┴─────────────┐
                               │   Unit & Schema Testing   │
                               │ Pytest + Pydantic + Mocks │
                               └───────────────────────────┘
```

The platform uses a 3-tier testing approach:
1. **Unit & Schema Tests**: Validate model attributes, Pydantic schemas, helper logic, and LLM fallback handlers.
2. **Integration API Tests**: Execute requests against FastAPI endpoints using `httpx.AsyncClient` with test database fixtures.
3. **E2E Integration Tests**: Test multi-domain workflows (e.g. User registration → Resume Upload → Match Calculation → Contract Sign → Task Submission).

---

## 2. Backend Test Suites Inventory (`apps/api/tests/`)

| Test Module | Coverage Area | Key Scenarios Tested |
|---|---|---|
| `test_auth.py` | Auth & Security | Registration, JWT generation, password hashing, invalid credentials |
| `test_engineers.py` | Engineer Profiles | Profile CRUD, completeness calculation, skill lists |
| `test_companies.py` | Company Profiles | Company CRUD, verification status |
| `test_jobs.py` | Jobs Domain | Job creation, multi-faceted filtering, sync log recording |
| `test_matching.py` | AI Matching | Multi-factor score calculator, weights, reasoning text |
| `test_applications.py` | Applications | Application state machine (SUBMITTED → ACCEPTED/REJECTED) |
| `test_projects.py` | Projects & Dispatch | AI project planner, milestone creation, task dispatch offers |
| `test_contracts.py` | Digital Contracts | Contract creation, milestone definitions, digital signing |
| `test_trust_reputation.py`| Trust Engine | Verified score calculation, component weights |
| `test_payments.py` | Payments Wallet | Wallet balances, deposit, escrow lock, release |
| `test_social_feed.py` | Social Feed | Post creation, public/connection feeds, like toggle, comments |
| `test_groups.py` | Groups Domain | Group creation, join/leave, member permissions, group feed |
| `test_quality_engine.py` | AI Quality Engine | Deliverable evaluation, code review, line comments, fallbacks |
| `test_admin_extensions.py`| Admin Console | Telemetry endpoints, AI token cost tracking, system health |

---

## 3. Running Backend Tests

### Option A: Local Execution (when Python 3.11 is installed)
```bash
cd apps/api
pytest tests/ -v
```

### Option B: Execution via Docker (Recommended)
```bash
docker-compose -f infra/docker/docker-compose.yml exec api pytest tests/ -v
```

---

## 4. Running Frontend Tests & Type Check

### Type Checking
```bash
cd apps/web
npm run type-check
```

### Linter & Build Validation
```bash
cd apps/web
npm run lint
npm run build
```

---

## 5. End-to-End User Journey Verification Matrix

| User Journey | Domain Sequence | Verification Steps |
|---|---|---|
| **1. Engineer Onboarding** | Auth → Engineer Profile → Resume Upload | 1. Register engineer account<br>2. Complete bio and skills<br>3. Upload resume PDF<br>4. Verify AI skill extraction |
| **2. Job Matching & Application** | Jobs → AI Matching → Application | 1. Browse remote jobs<br>2. Check AI match score & 6-factor breakdown<br>3. Submit application |
| **3. Project Brief & Dispatch** | Projects → AI Planner → Dispatch | 1. Company creates project brief<br>2. AI generates plan & milestones<br>3. Approve plan<br>4. Offer task to candidate |
| **4. Work Execution & Review** | Execution Hub → Submissions → AI Quality | 1. Engineer accepts task offer<br>2. Submit work deliverable URL<br>3. Trigger AI Quality Engine assessment<br>4. Client approves work |
| **5. Contract Signing & Escrow** | Contracts → Payments Wallet | 1. Draft contract for project<br>2. Both parties digitally sign<br>3. Fund escrow<br>4. Release funds on deliverable approval |
