# WorkMesh AI — Agent Handoff Protocol

Every AI agent (Antigravity, Codex, Claude, Cursor, local models, etc.) working on this repository MUST strictly follow this operational protocol to prevent context loss across developer sessions.

## 1. Agent Mental Model & Handoff Flow

```
                    WORKMESH REPOSITORY
                           │
                           ▼
                  READ PROJECT MEMORY (docs/*)
                           │
                           ▼
                 INSPECT ACTUAL CODE
                           │
                           ▼
              UNDERSTAND CURRENT STATE
                           │
                           ▼
                 SELECT CURRENT BATCH
                           │
                           ▼
                IMPLEMENT INCREMENTALLY
                           │
                           ▼
                    RUN TESTS & BUILDS
                           │
                    ┌──────┴──────┐
                    │             │
                  FAIL          PASS
                    │             │
                    ▼             ▼
                  FIX       UPDATE DOCS (docs/*)
                                  │
                                  ▼
                            COMMIT CHANGES
                                  │
                                  ▼
                            HANDOFF REPORT
                                  │
                                  ▼
                           NEXT AI AGENT
```

## 2. Mandatory Rules for Every Agent

1. **Read Before Writing**: Before touching code, read all files under `docs/` (`PRODUCT_VISION.md`, `ARCHITECTURE.md`, `CURRENT_STATE.md`, `IMPLEMENTATION_STATUS.md`, `ROADMAP.md`, `DECISIONS.md`, `DOMAIN_MODEL.md`, `API_CONTRACT.md`, `SECURITY_MODEL.md`, `UI_SYSTEM.md`).
2. **Do Not Rebuild**: Under no circumstances should any agent rebuild the application from scratch or replace the modular monolith architecture with microservices or alternative frameworks.
3. **Incremental Execution**: Implement only the designated batch (prompt package). Do not attempt to jump ahead.
4. **Build & Quality Gates**:
   - Backend: run `pytest` in `apps/api`.
   - Frontend: run `npm run lint` and `npx next build --webpack` in `apps/web`.
5. **Update Memory**: At the end of every work session/batch, update `docs/CURRENT_STATE.md`, `docs/IMPLEMENTATION_STATUS.md`, and any relevant memory documents to reflect exact progress made.
6. **Handoff Report**: Always summarize:
   - What was inspected & discovered.
   - What was implemented/fixed.
   - Quality gate results (tests/build status).
   - Clear recommendation for the next agent prompt.
