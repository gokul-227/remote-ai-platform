# WorkMesh AI — Product & Engineering Roadmap

This document maps out the controlled sequence of work packages (Batches) for the evolution of WorkMesh AI.

```
PROMPT 00 (Repo Takeover & Memory)  ──► DONE
   │
   ▼
PROMPT 01: Foundation Hardening (Auth/Authz, DB Integrity, API Consistency, Build Fixes)
   │
   ▼
PROMPT 02: Identity & Onboarding (Engineer / Company Onboarding Flows & Resume AI)
   │
   ▼
PROMPT 03: Professional Profile System (Public/Company Profiles, AI Skill Extraction)
   │
   ▼
PROMPT 04: Job Marketplace Hardening (Aggregators, Deduplication, Filters, Admin Sync)
   │
   ▼
PROMPT 05: Explainable AI Matching Engine (Skills, Exp, Timezone, Salary Matching)
   │
   ▼
PROMPT 06: Professional Social Network (Connections, Posts, Feed, Moderation)
   │
   ▼
PROMPT 07: Real-Time Professional Messaging (WebSocket Chat, Presence, Persistence)
   │
   ▼
PROMPT 08: Company Talent Marketplace (Candidate Discovery, Invites, Pipelines)
   │
   ▼
PROMPT 09: AI Project Creation & Planning (NL to Milestones/Tasks, Approval Flow)
   │
   ▼
PROMPT 10: Uber-Style Work Dispatch (Task Allocation, Qualification Ranking, Fairness)
   │
   ▼
PROMPT 11: AI Project Manager (Daily Summaries, Risk Detection, Progress Monitoring)
   │
   ▼
PROMPT 12: Platform Admin Console (Control Plane, User/Job Moderation, System Metrics)
   │
   ▼
PROMPT 13: Notification Platform (In-App, Email, Provider Abstraction)
   │
   ▼
PROMPT 14: Payment Domain Foundation (Conceptual Ledger, Escrow Models — NO REAL MONEY)
   │
   ▼
PROMPT 15: Trust & Reputation (Ratings, Reviews, Explainable Trust Scores)
   │
   ▼
PROMPT 16: Enterprise UI System (WorkMesh Navigation, Reusable Component Library)
   │
   ▼
PROMPT 17: Security Hardening (IDOR, Rate Limiting, File Sanitization, Audit)
   │
   ▼
PROMPT 18: Observability & Reliability (Structured Logs, Metrics, Health Checks)
   │
   ▼
PROMPT 19: Full End-to-End QA (Complete Persona Journeys, Integration Verification)
   │
   ▼
PROMPT 20: Production Deployment Readiness (CI/CD, Docker, Environment Configuration)
   │
   ▼
PROMPT 21: Architecture Governance (Periodic Alignment & Audit)
```

## Batch Rules
1. **Never skip batches or attempt multiple batches in one prompt.**
2. **Always test and run build checks (`npx next build --webpack` and `pytest`) before finishing a batch.**
3. **Update project memory files (`docs/*`) at the end of every batch.**
