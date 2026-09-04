# UI/UX REDESIGN MASTER AUDIT — REMOTE AI PLATFORM

> **Audit Baseline**: 39 Web Application Routes, 19 Backend Domains, production API (see internal deployment docs for the live URL)  
> **Objective**: Comprehensive blueprint for transforming Remote AI Platform into an enterprise-grade professional operating system combining features of LinkedIn, Facebook, Upwork, Slack, Notion, Linear, and Stripe with a unified visual language.

---

## 1. Executive Summary & System Architecture

### Core Product Identity
Remote AI Platform is an **intelligent professional operating system** for remote tech talent and hiring organizations. It integrates:
1. **Professional Identity & Network** (LinkedIn-inspired profile graph, trust scores, recommendations, connections)
2. **Social Stream & Activity** (Facebook-inspired feed, posts, reactions, discussions, community groups)
3. **Work & Project Execution OS** (Upwork + Linear inspired task dispatches, contracts, milestones, deliverables, AI progress & risk reports)
4. **Unified Workspace Shell** (Slack + Notion inspired workspace switching, contextual sidebars, unified search)
5. **Financial Ledger & Escrow** (Stripe-inspired escrow balances, release flows, transaction history)

---

## 2. Comprehensive Route Audit (39 Routes)

### Route 1: Landing Page (`/`)
- **Current Purpose**: Public landing & hero section.
- **Current UI Problems**: Generic layout; lacks interactive product previews and clear brand positioning.
- **Backend Endpoints**: `GET /jobs?limit=5`, `GET /engineers?limit=5`, `GET /health`
- **Missing Functionality**: Live interactive job/AI match demo, employer vs talent CTA paths, social proof metrics.
- **Target UX**: High-converting enterprise landing page featuring real product UI hero mockups, dual CTA tracks ("Find your next role" vs "Hire exceptional engineers"), interactive AI matching preview, live platform statistics, and trust badges.
- **Target Components**: `HeroHeader`, `ProductPreviewCard`, `FeatureGrid`, `LiveStatsBanner`, `TrustBadgeRow`, `Footer`
- **Loading State**: Skeleton hero banner and placeholder card grids.
- **Empty State**: Fallback metrics if stats API is unreachable.
- **Error State**: Non-blocking toast notification; degrades gracefully to static value propositions.
- **Mobile Behavior**: Single-column vertical flow with sticky CTA bar at bottom.
- **Authorization**: Public (Unauthenticated allowed).
- **Test Requirements**: E2E test verifying dual CTA navigation and landing section renders without console errors.

---

### Route 2: Login (`/auth/login`)
- **Current Purpose**: User authentication entry point.
- **Current UI Problems**: Single centered card; lacks split-screen branding or security/value prop context.
- **Backend Endpoints**: `POST /auth/login` (or `/auth/token`), `GET /auth/me`
- **Missing Functionality**: OIDC / Keycloak single-sign-on shortcut, "Remember Me" session persistence indicator.
- **Target UX**: Enterprise 2-column layout: Left column showcases live platform highlights and security guarantees; Right column presents a focused, accessible login card with inline validation.
- **Target Components**: `SplitAuthLayout`, `LoginForm`, `Input`, `Button`, `AlertBanner`
- **Loading State**: Spinner inside submit button (`isPending`).
- **Empty State**: N/A (Form input page).
- **Error State**: Inline alert banner differentiating between invalid credentials (401) and server/network downtime.
- **Mobile Behavior**: Hides left product showcase column; displays logo and centered form card.
- **Authorization**: Public (Logged-in users redirected to active workspace dashboard).
- **Test Requirements**: Playwright test covering valid login, invalid password error, and redirect behavior.

---

### Route 3: Register (`/auth/register`)
- **Current Purpose**: Account registration.
- **Current UI Problems**: 2-step form lacks visual flair and clear value preview.
- **Backend Endpoints**: `POST /auth/register`, `POST /auth/login`
- **Missing Functionality**: Multi-step wizard with visual intent selection (Looking for work vs Hiring vs Both).
- **Target UX**: Guided 4-step wizard: Step 1 (Account credentials & password strength), Step 2 (Intent selection with rich card choices), Step 3 (Identity details), Step 4 (Direct onboarding transition).
- **Target Components**: `RegisterWizard`, `StepIndicator`, `PasswordStrengthMeter`, `RoleCardGroup`
- **Loading State**: Step-level skeleton and submit loading state.
- **Empty State**: N/A.
- **Error State**: Field-level validation messages and top-level registration error alert.
- **Mobile Behavior**: Compact step dots with full-width action buttons.
- **Authorization**: Public (Logged-in users redirected).
- **Test Requirements**: E2E test verifying engineer & company registration paths.

---

### Route 4: Forgot Password (`/auth/forgot-password`)
- **Current Purpose**: Password recovery request.
- **Current UI Problems**: Minimal stub form without clear feedback or resend timer.
- **Backend Endpoints**: Password reset backend stub (Honest frontend fallback).
- **Missing Functionality**: Resend confirmation timer, email validation check.
- **Target UX**: Clean single-card recovery interface explaining the recovery flow with honest feedback.
- **Target Components**: `Card`, `Input`, `Button`, `AlertBanner`
- **Loading State**: Submit button spinner.
- **Empty State**: N/A.
- **Error State**: Clear error message explaining reset availability.
- **Mobile Behavior**: Centered full-width card.
- **Authorization**: Public.
- **Test Requirements**: Verify form submission and navigation links back to login.

---

### Route 5: Onboarding Wizard (`/onboarding`)
- **Current Purpose**: Guided post-signup profile initialization.
- **Current UI Problems**: Recently created in Phase 4; needs deeper integration with AI resume parsing feedback.
- **Backend Endpoints**: `POST /engineers/me/resume`, `POST /engineers/me/ai-enhance`, `POST /engineers/me`, `POST /companies/me`
- **Missing Functionality**: Drag-and-drop resume dropzone with real-time parsing progress meter.
- **Target UX**: High-touch onboarding wizard for both talent and hiring managers with real-time AI resume extraction previews.
- **Target Components**: `OnboardingWizard`, `Dropzone`, `AIParsingProgress`, `ProfileReviewForm`
- **Loading State**: AI extraction spinner and parsing progress animation.
- **Empty State**: Option to skip resume upload and fill profile manually.
- **Error State**: Inline alert with option to retry upload or switch to manual input.
- **Mobile Behavior**: Responsive full-screen step wizard with bottom fixed navigation.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for resume upload and company profile wizard.

---

### Route 6: Unified Profile Router (`/profile`)
- **Current Purpose**: Active persona profile router.
- **Current UI Problems**: Created in Phase 6 as a redirect; needs seamless persona resolution.
- **Backend Endpoints**: `GET /auth/me`
- **Missing Functionality**: N/A (Intentional persona router).
- **Target UX**: Instant silent resolution of `user.role` directing user to `/engineer/profile` or `/company/profile`.
- **Target Components**: `RequireAuth`, `CenteredLoader`
- **Loading State**: Minimal centered spinner.
- **Empty State**: N/A.
- **Error State**: Redirects to `/auth/login` if unauthenticated.
- **Mobile Behavior**: Identical.
- **Authorization**: Authenticated.
- **Test Requirements**: Test routing for both ENGINEER and COMPANY user sessions.

---

### Route 7: Engineer Dashboard (`/engineer/dashboard`)
- **Current Purpose**: Engineer career command center.
- **Current UI Problems**: Relies on basic card layouts; needs high-density career metrics, AI match spotlight, and activity timeline.
- **Backend Endpoints**: `GET /engineers/me`, `GET /jobs?limit=5`, `GET /matching/recommendations`, `GET /applications/me`, `GET /saved-jobs`
- **Missing Functionality**: Interactive career growth insights and AI skill gap analysis spotlight.
- **Target UX**: High-density command center: Top career status header, 4-tile metric grid (Profile Readiness, AI Matches, Applications, Saved Roles), AI Match Spotlight card, recommended jobs stream, and career progress sidebar.
- **Target Components**: `Sidebar`, `RightSidebar`, `AIMatchPanel`, `JobCard`, `MetricCard`, `ProgressRing`
- **Loading State**: Skeleton grid matching final dashboard layout.
- **Empty State**: Dedicated onboarding state if `GET /engineers/me` returns 404.
- **Error State**: Graceful section-level retry buttons if recommendation services fail.
- **Mobile Behavior**: Collapses to single column with bottom navigation bar.
- **Authorization**: Authenticated (`RequireRole(["ENGINEER"])`).
- **Test Requirements**: E2E test for engineer dashboard loading and role guarding.

---

### Route 8: Engineer Profile Manager (`/engineer/profile`)
- **Current Purpose**: Engineer profile view & editor.
- **Current UI Problems**: Heavy drawer forms; needs tabbed editing (Overview, Experience, Skills, Resume/AI).
- **Backend Endpoints**: `GET /engineers/me`, `PUT /engineers/me`, `POST /engineers/me/resume`, `POST /engineers/me/ai-enhance`
- **Missing Functionality**: Live profile completeness meter with instant AI enhance trigger.
- **Target UX**: LinkedIn-inspired professional profile page featuring a cover banner, avatar, headline, trust score badge, AI summary box, skills chips, experience timeline, and edit drawers.
- **Target Components**: `ProfileHeader`, `TrustBadge`, `ExperienceTimeline`, `SkillChipGroup`, `EditProfileDrawer`
- **Loading State**: Full-page profile skeleton.
- **Empty State**: `CreateProfileForm` banner with AI Resume Import CTA.
- **Error State**: Toast error on failed profile updates.
- **Mobile Behavior**: Stacked single column with tabbed navigation.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for editing profile fields and uploading resume.

---

### Route 9: Engineer Recommendations (`/engineer/recommendations`)
- **Current Purpose**: AI job match recommendations feed.
- **Current UI Problems**: Uses alternative dark-themed styling inconsistent with global CSS variables.
- **Backend Endpoints**: `GET /matching/recommendations`
- **Missing Functionality**: Filter by match score threshold (>80%, >90%), skill filter overlay.
- **Target UX**: Harmonized AI match recommendations hub displaying explainable 6-factor score cards and one-click apply options.
- **Target Components**: `AIMatchPanel`, `JobCard`, `ScoreFilterTabs`, `Badge`
- **Loading State**: Match card skeletons.
- **Empty State**: `EmptyState` explaining how to improve match scores by updating profile.
- **Error State**: Error alert with retry button.
- **Mobile Behavior**: Single column card feed.
- **Authorization**: Authenticated (`RequireRole(["ENGINEER"])`).
- **Test Requirements**: Test recommendation feed loading and match score rendering.

---

### Route 10: Engineer Applications (`/engineer/applications`)
- **Current Purpose**: Job application tracker.
- **Current UI Problems**: Simple list; needs visual pipeline stage indicators and timeline milestones.
- **Backend Endpoints**: `GET /applications/me`, `DELETE /applications/{id}`
- **Missing Functionality**: Application status stage pipeline (Applied $\rightarrow$ Reviewing $\rightarrow$ Interview $\rightarrow$ Offer $\rightarrow$ Rejected).
- **Target UX**: Linear/Kanban style job application tracking board showing application status, company logo, applied date, match score, and withdraw action.
- **Target Components**: `ApplicationStatusPipeline`, `JobCard`, `StatusBadge`, `Button`
- **Loading State**: Application card skeletons.
- **Empty State**: `EmptyState` with CTA to browse open jobs.
- **Error State**: Section-level error alert.
- **Mobile Behavior**: Stacked card list grouped by application status.
- **Authorization**: Authenticated (`RequireRole(["ENGINEER"])`).
- **Test Requirements**: E2E test for application listing and withdrawal.

---

### Route 11: Engineer Workspace (`/engineer/workspace`)
- **Current Purpose**: Task dispatch & active work engine.
- **Current UI Problems**: Disconnected layout; needs clear task offer list and deliverable submission modal.
- **Backend Endpoints**: `GET /marketplace/offers/me`, `POST /marketplace/offers/{id}/accept`, `POST /marketplace/offers/{id}/decline`
- **Missing Functionality**: Real-time task offer acceptance modal with contract preview.
- **Target UX**: Task execution hub: Pending task offers, active task dispatches, submission dropzones, and payout estimates.
- **Target Components**: `OfferCard`, `TaskDispatchTable`, `SubmissionModal`, `StatusBadge`
- **Loading State**: Task table skeletons.
- **Empty State**: `EmptyState` explaining how company invitations work.
- **Error State**: Error banner with retry capability.
- **Mobile Behavior**: Responsive card list.
- **Authorization**: Authenticated (`RequireRole(["ENGINEER"])`).
- **Test Requirements**: Test task offer listing and status updates.

---

### Route 12: Public Engineer Detail (`/engineers/[id]`)
- **Current Purpose**: Public engineer profile view.
- **Current UI Problems**: Lacks candidate comparison or shortlist actions for hiring managers.
- **Backend Endpoints**: `GET /engineers/{id}`, `GET /matching/jobs/{job_id}`
- **Missing Functionality**: Recruiter shortlist button, direct message initiation.
- **Target UX**: Recruiter-facing public profile showcase with AI match score overlay against company's active roles, trust score, experience timeline, skills, and direct message CTA.
- **Target Components**: `ProfileHeader`, `TrustBadge`, `AIMatchPanel`, `ExperienceTimeline`, `Button`
- **Loading State**: Profile hero skeleton.
- **Empty State**: `EmptyState` if engineer ID is not found.
- **Error State**: 404 error screen with "Back to Talent Directory" CTA.
- **Mobile Behavior**: Stacked layout with sticky action bar.
- **Authorization**: Public / Authenticated.
- **Test Requirements**: E2E test for viewing engineer profile and triggering message.

---

### Route 13: Talent Directory (`/engineers`, `/freelancers`)
- **Current Purpose**: Public directory of engineers and freelancers.
- **Current UI Problems**: Basic grid; lacks faceted filtering by experience, skills, location, and AI match score.
- **Backend Endpoints**: `GET /engineers/search` (or `/engineers`)
- **Missing Functionality**: Multi-skill multi-select filter, availability toggle.
- **Target UX**: Enterprise talent directory: Top search header, sidebar filters (Skills, Role, Experience, Location, Hourly Rate), and talent grid with AI readiness badges.
- **Target Components**: `SearchInput`, `FilterBar`, `UserCard`, `Badge`, `Pagination`
- **Loading State**: Talent card grid skeletons.
- **Empty State**: `EmptyState` for zero search results.
- **Error State**: Network error banner with retry.
- **Mobile Behavior**: Drawer-based filter panel and single-column grid.
- **Authorization**: Public / Authenticated.
- **Test Requirements**: Test searching and filtering talent.

---

### Route 14: Social Feed (`/feed`)
- **Current Purpose**: Community social stream.
- **Current UI Problems**: Basic single-column feed; recently upgraded to 3-column, needs reaction pickers and comment threads.
- **Backend Endpoints**: `GET /social/posts`, `POST /social/posts`, `POST /social/posts/{id}/like`, `DELETE /social/posts/{id}`
- **Missing Functionality**: Share link toast feedback, post media/link attachments preview.
- **Target UX**: 3-column Facebook/LinkedIn-inspired feed: Left nav, Center post composer & feed stream with filter tabs (All, Connections, Media), Right trending sidebar.
- **Target Components**: `Sidebar`, `RightSidebar`, `PostCard`, `Avatar`, `Textarea`, `Toast`
- **Loading State**: Post skeletons.
- **Empty State**: `EmptyState` prompting user to write their first update.
- **Error State**: Error banner with retry.
- **Mobile Behavior**: Single-column stream with mobile bottom nav.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for creating a post, liking, and commenting.

---

### Route 15: Professional Network (`/network`)
- **Current Purpose**: Connections and professional network hub.
- **Current UI Problems**: Minimal list; needs tabbed interface (My Network, Invitations, Discover People).
- **Backend Endpoints**: `GET /connections/me`, `POST /connections/request`, `POST /connections/{id}/accept`, `DELETE /connections/{id}`
- **Missing Functionality**: Pending invitation badge, connection suggestion cards.
- **Target UX**: Tabbed network hub: Connection cards with mutual connection counts, pending invitation management, and AI recommended professionals.
- **Target Components**: `Tabs`, `UserCard`, `Button`, `Badge`, `EmptyState`
- **Loading State**: User card skeletons.
- **Empty State**: `EmptyState` encouraging users to connect.
- **Error State**: Error notice with retry.
- **Mobile Behavior**: Single-column card list.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: Test connection request sending and tab navigation.

---

### Route 16: Messaging (`/messages`)
- **Current Purpose**: Real-time direct messaging.
- **Current UI Problems**: basic conversation list; needs WebSocket real-time indicators and unread badges.
- **Backend Endpoints**: `GET /messages/conversations`, `GET /messages/conversations/{id}`, `POST /messages/send`, WebSocket `/ws/chat/{conversation_id}`
- **Missing Functionality**: Real-time typing indicators, read receipts.
- **Target UX**: Slack/LinkedIn-style split messenger: Left conversation list with search and unread badges; Right active chat window with message bubbles and send bar.
- **Target Components**: `ConversationList`, `MessageBubble`, `Input`, `Button`, `Avatar`
- **Loading State**: Conversation and message list skeletons.
- **Empty State**: `EmptyState` when no conversation is selected.
- **Error State**: Disconnected banner with reconnect button.
- **Mobile Behavior**: Full-screen conversation list switching to active chat on tap with back arrow.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for selecting conversation and sending message.

---

### Route 17: Groups & Hubs (`/groups`)
- **Current Purpose**: Technical interest groups and community hubs.
- **Current UI Problems**: Simple card grid; lacks group detail modal/feed integration.
- **Backend Endpoints**: `GET /social/groups`, `POST /social/groups`, `POST /social/groups/{id}/join`, `POST /social/groups/{id}/leave`
- **Missing Functionality**: Group creation modal, member count badges.
- **Target UX**: Community hubs catalog: Search bar, category filters, group cards with member counts and join/leave toggles.
- **Target Components**: `GroupCard`, `Button`, `Badge`, `Modal`, `SearchInput`
- **Loading State**: Group card skeletons.
- **Empty State**: `EmptyState` if no groups match search.
- **Error State**: Error alert with retry.
- **Mobile Behavior**: Grid collapses to 1 column.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: Test joining and leaving community groups.

---

### Route 18: Job Marketplace (`/jobs`)
- **Current Purpose**: Job search engine.
- **Current UI Problems**: Single list view; needs split-pane desktop preview option and faceted filter panel.
- **Backend Endpoints**: `GET /jobs`, `GET /saved-jobs`, `POST /saved-jobs`
- **Missing Functionality**: Faceted salary slider, job source pills (RemoteOK, Remotive, Arbeitnow, USAJobs, The Muse).
- **Target UX**: Enterprise job search engine: Search header, sidebar filter panel (Job Type, Seniority, Salary, Skills, Source), job listings list, and pagination controls.
- **Target Components**: `Sidebar`, `RightSidebar`, `JobCard`, `SearchInput`, `Select`, `Badge`
- **Loading State**: Job card skeletons.
- **Empty State**: `EmptyState` with filter reset CTA.
- **Error State**: Error banner with retry.
- **Mobile Behavior**: Filter drawer and single-column job cards.
- **Authorization**: Public / Authenticated.
- **Test Requirements**: E2E test for job search and filtering.

---

### Route 19: Job Detail Page (`/jobs/[id]`)
- **Current Purpose**: Specific job posting view.
- **Current UI Problems**: Needs cleaner right-rail AI match score presentation.
- **Backend Endpoints**: `GET /jobs/{id}`, `GET /matching/jobs/{id}`, `POST /applications`
- **Missing Functionality**: One-click apply feedback toast, copy job link.
- **Target UX**: High-converting job detail page: Company header, role badges, job description, requirements, skills tags, and right-rail AI Match Panel with 6-factor breakdown.
- **Target Components**: `AIMatchPanel`, `Badge`, `Button`, `Toast`, `Breadcrumb`
- **Loading State**: Job detail skeleton.
- **Empty State**: `EmptyState` if job ID is invalid or closed.
- **Error State**: 404 page with "Browse Jobs" CTA.
- **Mobile Behavior**: Stacked layout with sticky bottom Apply bar.
- **Authorization**: Public / Authenticated.
- **Test Requirements**: E2E test for viewing job detail, AI match, and applying.

---

### Route 20: Post a Job Wizard (`/jobs/new`)
- **Current Purpose**: Job creation form for employers.
- **Current UI Problems**: Basic form; needs 5-step wizard with AI job description optimization.
- **Backend Endpoints**: `POST /jobs`
- **Missing Functionality**: AI job description enhancement prompt, skill auto-complete.
- **Target UX**: Premium 5-step job creation wizard: Step 1 (Role basics), Step 2 (Description & AI optimize), Step 3 (Requirements & Skills), Step 4 (Compensation & Location), Step 5 (Preview & Publish).
- **Target Components**: `StepIndicator`, `Input`, `Textarea`, `Select`, `Button`, `Badge`
- **Loading State**: Submit spinner.
- **Empty State**: N/A.
- **Error State**: Inline validation errors.
- **Mobile Behavior**: Compact step dots and responsive form.
- **Authorization**: Authenticated (`RequireRole(["COMPANY", "ADMIN"])`).
- **Test Requirements**: E2E test for creating a new job posting.

---

### Route 21: Company Dashboard (`/company/dashboard`)
- **Current Purpose**: Hiring command center.
- **Current UI Problems**: Generic stats; needs hiring pipeline metrics, active role management, and top candidate recommendations.
- **Backend Endpoints**: `GET /companies/me`, `GET /jobs/company`, `GET /applications/company`, `GET /matching/candidates/{job_id}`
- **Missing Functionality**: Missing-profile gate with onboarding CTA (Shipped in Phase C).
- **Target UX**: Executive hiring command center: Metric tiles (Active Jobs, Applications, Candidates, Shortlisted), active jobs list, recent candidate applications stream, and quick action bar.
- **Target Components**: `MetricCard`, `JobCard`, `CandidateCard`, `Button`, `StatusBadge`
- **Loading State**: Dashboard skeleton grid.
- **Empty State**: "Set up company profile" onboarding state if company profile does not exist.
- **Error State**: Section-level error alerts.
- **Mobile Behavior**: Single column layout.
- **Authorization**: Authenticated (`RequireRole(["COMPANY", "ADMIN"])`).
- **Test Requirements**: E2E test for company dashboard loading and role guarding.

---

### Route 22: Company Profile Manager (`/company/profile`)
- **Current Purpose**: Company profile viewer & editor.
- **Current UI Problems**: Simple form; needs cover banner, tech stack editor, open positions preview, and verification badge.
- **Backend Endpoints**: `GET /companies/me`, `POST /companies/me`, `PUT /companies/me`, `GET /jobs/company`
- **Missing Functionality**: Company logo upload, tech stack manager.
- **Target UX**: Organization profile editor: Cover banner, company logo, industry, company size, headquarters, mission description, tech stack tags, and open jobs list.
- **Target Components**: `ProfileHeader`, `Badge`, `Button`, `EditCompanyProfileDrawer`
- **Loading State**: Profile skeleton.
- **Empty State**: `CreateCompanyProfileForm` for new organization accounts.
- **Error State**: Toast error on update failure.
- **Mobile Behavior**: Stacked layout.
- **Authorization**: Authenticated (`RequireRole(["COMPANY", "ADMIN"])`).
- **Test Requirements**: E2E test for editing company profile.

---

### Route 23: Company Jobs (`/company/jobs`)
- **Current Purpose**: Employer's posted job listings manager.
- **Current UI Problems**: Basic list; needs job status filters (Active, Draft, Closed), application counts per job, and edit/delete actions.
- **Backend Endpoints**: `GET /jobs/company`, `DELETE /jobs/{id}`
- **Missing Functionality**: Quick toggle job status (active/closed).
- **Target UX**: Job management console: Search & filter bar, job rows with application count badges, views count, edit link, and candidate match shortcuts.
- **Target Components**: `DataTable`, `StatusBadge`, `Button`, `Badge`
- **Loading State**: Table skeletons.
- **Empty State**: `EmptyState` with "Post Your First Job" CTA.
- **Error State**: Error notice with retry.
- **Mobile Behavior**: Card-based job list.
- **Authorization**: Authenticated (`RequireRole(["COMPANY", "ADMIN"])`).
- **Test Requirements**: Test listing and managing company jobs.

---

### Route 24: Candidate Discovery & Pipeline (`/company/candidates`)
- **Current Purpose**: Talent discovery and applicant review.
- **Current UI Problems**: Single list; needs Kanban applicant pipeline alongside public candidate directory.
- **Backend Endpoints**: `GET /engineers/search`, `GET /applications/company`, `PATCH /applications/{id}`, `POST /applications/invite`
- **Missing Functionality**: Application review stage transitions (`SUBMITTED` $\rightarrow$ `REVIEWING` $\rightarrow$ `SHORTLISTED` $\rightarrow$ `ACCEPTED`).
- **Target UX**: Recruiter-grade candidate hub: Search & filter controls, application status pipeline review cards, and candidate search grid with AI match scores.
- **Target Components**: `SearchInput`, `Select`, `Avatar`, `MatchPill`, `StatusBadge`, `Button`
- **Loading State**: Candidate card skeletons.
- **Empty State**: `EmptyState` for zero search matches.
- **Error State**: Error banner with retry.
- **Mobile Behavior**: Stacked cards and status filter dropdown.
- **Authorization**: Authenticated (`RequireRole(["COMPANY", "ADMIN"])`).
- **Test Requirements**: E2E test for candidate search and application status updates.

---

### Route 25: Public Company Detail (`/companies/[id]`)
- **Current Purpose**: Public company profile page.
- **Current UI Problems**: Basic layout; needs open job listings grid and company tech stack showcase.
- **Backend Endpoints**: `GET /companies/{id}`, `GET /jobs/company/{id}`
- **Missing Functionality**: Verification badge display, company job board link.
- **Target UX**: Public organization showcase: Cover banner, logo, verified status badge, company info grid, tech stack tags, and live open positions list.
- **Target Components**: `ProfileHeader`, `Badge`, `JobCard`, `ShieldCheck`
- **Loading State**: Profile skeleton.
- **Empty State**: `EmptyState` if company ID does not exist.
- **Error State**: 404 screen with "Back to Companies" CTA.
- **Mobile Behavior**: Stacked layout.
- **Authorization**: Public / Authenticated.
- **Test Requirements**: Test viewing company profile.

---

### Route 26: Companies Directory (`/companies`)
- **Current Purpose**: Directory of hiring companies.
- **Current UI Problems**: Simple grid; needs industry and company size filters.
- **Backend Endpoints**: `GET /companies`
- **Missing Functionality**: Industry filter tabs.
- **Target UX**: Organization directory: Search header, industry category filters, company cards with active job counts.
- **Target Components**: `SearchInput`, `CompanyCard`, `Badge`, `Pagination`
- **Loading State**: Company card skeletons.
- **Empty State**: `EmptyState` if no companies match search.
- **Error State**: Error banner with retry.
- **Mobile Behavior**: 1-column grid.
- **Authorization**: Public / Authenticated.
- **Test Requirements**: Test searching company directory.

---

### Route 27: Projects Hub (`/projects`)
- **Current Purpose**: AI project briefs and delivery hub.
- **Current UI Problems**: Needs 3-column enterprise styling and project brief modal.
- **Backend Endpoints**: `GET /projects`, `POST /projects`
- **Missing Functionality**: Project status filter tabs (Planning, Active, Completed).
- **Target UX**: AI Work OS project hub: Metrics summary tiles, project grid/list view toggle, status filters, and "New Project" modal.
- **Target Components**: `ProjectCard`, `StatusBadge`, `Button`, `Modal`, `Input`
- **Loading State**: Project card skeletons.
- **Empty State**: `EmptyState` with "Create Project Brief" CTA.
- **Error State**: Error banner with retry.
- **Mobile Behavior**: Single column project cards.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for creating and listing projects.

---

### Route 28: Project Workspace (`/projects/[id]`)
- **Current Purpose**: AI Work OS project execution workspace.
- **Current UI Problems**: Complex page; needs organized tabs (Overview, Tasks, Deliverables, AI Tools).
- **Backend Endpoints**: `GET /projects/{id}`, `GET /projects/{id}/tasks`, `POST /projects/{id}/tasks`, `POST /projects/{id}/ai/plan`, `POST /projects/{id}/ai/progress`, `POST /projects/{id}/ai/risks`
- **Missing Functionality**: AI Work OS tab bar (Overview, Tasks & Milestones, Work Deliverables, AI Reports).
- **Target UX**: Linear/Notion-inspired project workspace: Project header with health status, milestone progress bar, task board with inline status changes, deliverable review cards, and AI Copilot reports.
- **Target Components**: `Progress`, `StatusBadge`, `TaskCard`, `SubmissionCard`, `Button`, `Textarea`
- **Loading State**: Workspace skeleton.
- **Empty State**: `EmptyState` for projects with no tasks.
- **Error State**: Section-level error notices.
- **Mobile Behavior**: Accordion-based section views.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for task status updates and AI progress report generation.

---

### Route 29: Contracts List (`/contracts`)
- **Current Purpose**: Digital legal contract lifecycle tracker.
- **Current UI Problems**: Simple list; needs status filter badges and signing CTA.
- **Backend Endpoints**: `GET /contracts/me`
- **Missing Functionality**: Contract status filter (Draft, Active, Completed).
- **Target UX**: Contract management console: Contract rows with title, counterparty, value, status badge, and view details action.
- **Target Components**: `DataTable`, `StatusBadge`, `Button`
- **Loading State**: Table skeletons.
- **Empty State**: `EmptyState` for zero contracts.
- **Error State**: Error notice with retry.
- **Mobile Behavior**: Responsive contract cards.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: Test listing user contracts.

---

### Route 30: Contract Detail (`/contracts/[id]`)
- **Current Purpose**: Digital contract viewing and signing page.
- **Current UI Problems**: Basic view; needs contract terms preview and signature modal.
- **Backend Endpoints**: `GET /contracts/{id}`, `POST /contracts/{id}/sign`
- **Missing Functionality**: E-signature button and audit timestamp log.
- **Target UX**: Formal contract viewer: Terms document preview, counterparty signatures, milestone schedule, and digital signature button.
- **Target Components**: `StatusBadge`, `Button`, `Modal`
- **Loading State**: Document skeleton.
- **Empty State**: `EmptyState` if contract not found.
- **Error State**: Error notice.
- **Mobile Behavior**: Full-width document preview.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for viewing and signing contract.

---

### Route 31: Wallet & Payments (`/payments`)
- **Current Purpose**: Financial ledger and escrow holding.
- **Current UI Problems**: Basic page; recently upgraded to 3-column layout.
- **Backend Endpoints**: `GET /payments/wallet`, `GET /payments/transactions`, `POST /payments/escrow/create`, `POST /payments/escrow/{id}/release`, `POST /payments/escrow/{id}/refund`
- **Missing Functionality**: Fund Escrow modal with project/payee selector.
- **Target UX**: Stripe-quality financial portal: 3-column layout, Balance summary cards (Escrow Held, Total Spent/Earned, Released), transaction ledger table with status badges and release/refund actions.
- **Target Components**: `Sidebar`, `RightSidebar`, `MetricCard`, `StatusBadge`, `Button`, `Modal`
- **Loading State**: Balance and table skeletons.
- **Empty State**: `EmptyState` when transaction history is empty.
- **Error State**: Error alert with retry.
- **Mobile Behavior**: Responsive stacked view.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for wallet balance loading and escrow funding modal.

---

### Route 32: Notifications Center (`/notifications`)
- **Current Purpose**: Activity notification feed.
- **Current UI Problems**: Simple list; needs filter tabs (All, Unread, System) and "Mark all as read" button.
- **Backend Endpoints**: `GET /notifications`, `POST /notifications/read-all`, `PATCH /notifications/{id}/read`
- **Missing Functionality**: Mark read action on item click.
- **Target UX**: Enterprise notification center: Filter tabs, unread count badge, notification item list with deep-link navigation and mark-as-read toggles.
- **Target Components**: `NotificationItem`, `Badge`, `Button`, `Tabs`
- **Loading State**: Notification list skeletons.
- **Empty State**: `EmptyState` when no notifications exist.
- **Error State**: Error notice with retry.
- **Mobile Behavior**: Full-width item list.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: Test notification listing and marking as read.

---

### Route 33: AI Code Quality OS (`/quality`)
- **Current Purpose**: AI code evaluation & automated review.
- **Current UI Problems**: Unguarded page; needs auth check and code submission form.
- **Backend Endpoints**: `POST /quality/evaluate`, `POST /quality/review`
- **Missing Functionality**: Code snippet input box with syntax language selector.
- **Target UX**: AI Code Auditor interface: Code input area, language selection, evaluate button, and AI feedback breakdown card (Quality score, security risks, performance tips).
- **Target Components**: `RequireAuth`, `Textarea`, `Select`, `Button`, `ScoreRing`, `Badge`
- **Loading State**: Evaluation progress spinner.
- **Empty State**: `EmptyState` prompting code input.
- **Error State**: Error alert if AI evaluation fails.
- **Mobile Behavior**: Stacked layout.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: E2E test for submitting code snippet for AI evaluation.

---

### Route 34: Settings (`/settings`)
- **Current Purpose**: User account and notification settings.
- **Current UI Problems**: Basic options; needs tabbed interface (Account, Profile, Notifications, Security, Danger Zone).
- **Backend Endpoints**: `GET /auth/me`, `PATCH /auth/me`
- **Missing Functionality**: Password update form, notification preference toggles.
- **Target UX**: Enterprise settings portal: Left tab list (Account, Profile, Notifications, Security), right form card with save toast feedback.
- **Target Components**: `Tabs`, `Input`, `Button`, `Toast`
- **Loading State**: Settings skeleton.
- **Empty State**: N/A.
- **Error State**: Toast error on update failure.
- **Mobile Behavior**: Accordion or drop-down tab selection.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: Test changing settings.

---

### Route 35: Legacy Workspace (`/workspace`)
- **Current Purpose**: Redirect alias to active dashboard.
- **Current UI Problems**: N/A (Alias route).
- **Backend Endpoints**: `GET /auth/me`
- **Missing Functionality**: N/A.
- **Target UX**: Silent redirect to `/engineer/dashboard` or `/company/dashboard` based on `user.role`.
- **Target Components**: `RequireAuth`, `CenteredLoader`
- **Loading State**: Minimal centered spinner.
- **Empty State**: N/A.
- **Error State**: Redirects to `/auth/login`.
- **Mobile Behavior**: Identical.
- **Authorization**: Authenticated (`RequireAuth`).
- **Test Requirements**: Verify redirect behavior.

---

### Route 36: Admin Dashboard (`/admin/dashboard`)
- **Current Purpose**: System telemetry & control plane overview.
- **Current UI Problems**: Hardcoded health metrics; needs live telemetry integration.
- **Backend Endpoints**: `GET /admin/stats`, `GET /admin/health`
- **Missing Functionality**: Real live service health status (Postgres, Redis, S3/MinIO, Keycloak/Auth).
- **Target UX**: Control-plane admin dashboard: System metric tiles (Total Users, Active Jobs, Projects, Total Escrow), live service health status indicators, and administrative action bar.
- **Target Components**: `RequireRole(["ADMIN"])`, `MetricCard`, `StatusBadge`, `DataTable`
- **Loading State**: Dashboard skeleton grid.
- **Empty State**: N/A.
- **Error State**: Real error banner if health check fails.
- **Mobile Behavior**: Stacked cards.
- **Authorization**: Authenticated (`RequireRole(["ADMIN"])`).
- **Test Requirements**: E2E test for admin dashboard access and health telemetry.

---

### Route 37: Admin Users Management (`/admin/users`)
- **Current Purpose**: User moderation and administration console.
- **Current UI Problems**: Simple list; needs role filter, search, and deactivate actions.
- **Backend Endpoints**: `GET /admin/users`, `PATCH /admin/users/{id}`
- **Missing Functionality**: Role change dropdown, active/suspended toggle.
- **Target UX**: Administrative user management table: Search, role filter, user rows with avatar, email, role badge, status toggle, and edit drawer.
- **Target Components**: `RequireRole(["ADMIN"])`, `DataTable`, `SearchInput`, `Select`, `StatusBadge`, `Button`
- **Loading State**: Table skeletons.
- **Empty State**: `EmptyState` if search matches zero users.
- **Error State**: Error notice with retry.
- **Mobile Behavior**: Responsive table/card view.
- **Authorization**: Authenticated (`RequireRole(["ADMIN"])`).
- **Test Requirements**: E2E test for listing and filtering admin users.

---

### Route 38: Admin Jobs Management (`/admin/jobs`)
- **Current Purpose**: Platform job posting moderation console.
- **Current UI Problems**: Simple table; needs source filter and take-down toggle.
- **Backend Endpoints**: `GET /admin/jobs`, `DELETE /admin/jobs/{id}`
- **Missing Functionality**: Source adapter filter (RemoteOK, Remotive, Arbeitnow, USAJobs, The Muse, Internal).
- **Target UX**: Job moderation console: Source filter, status badges, job details view modal, and delete/flag actions.
- **Target Components**: `RequireRole(["ADMIN"])`, `DataTable`, `StatusBadge`, `Button`
- **Loading State**: Table skeletons.
- **Empty State**: `EmptyState` if no jobs exist.
- **Error State**: Error banner with retry.
- **Mobile Behavior**: Responsive table view.
- **Authorization**: Authenticated (`RequireRole(["ADMIN"])`).
- **Test Requirements**: E2E test for admin job moderation.

---

### Route 39: Public Landing / Home Shortcut (`/home`)
- **Current Purpose**: Route alias for landing or feed based on session status.
- **Current UI Problems**: N/A.
- **Backend Endpoints**: `GET /auth/me`
- **Missing Functionality**: N/A.
- **Target UX**: Authenticated users redirect to active dashboard; Unauthenticated users see public landing page.
- **Target Components**: `CenteredLoader`
- **Loading State**: Centered spinner.
- **Empty State**: N/A.
- **Error State**: N/A.
- **Mobile Behavior**: Identical.
- **Authorization**: Public.
- **Test Requirements**: Verify session-based redirection.

---

## 3. Implementation Action Strategy

1. **Enterprise Design Tokens**: Standardize font families, spacing grid, CSS variables, elevation shadows, and brand primary color `#0A66C2` across all 39 routes.
2. **App Shell Polish**: Standardize top navigation bar, left sidebar context, and right contextual rail across all major pages.
3. **Public Surfaces Overhaul**: Completely redesign Landing page (`/`), Registration (`/auth/register`), and Login (`/auth/login`) with high-end split-screen visuals and step wizards.
4. **Core Workspace Integration**: Seamlessly connect Onboarding (`/onboarding`), Feed (`/feed`), Unified Profile (`/profile`), Jobs (`/jobs`), Projects (`/projects`), Wallet (`/payments`), and Admin (`/admin/dashboard`).
5. **E2E & Build Verification**: Perform full automated lint, typecheck, build validation, and E2E journey tests.
