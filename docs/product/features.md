# Features

One member account does everything; staff use a separate console ([staff-console.md](staff-console.md)).
The navigation has seven sections: Home, Network, Collaboration, Jobs, Freelancing, Projects, Account.
Status reflects the code; "partial" items are labelled honestly in the product.

| Area | What members can do | Status |
| --- | --- | --- |
| Home overview | After sign-in: getting-started checklist, jobs for you, messages, network, projects, files, meetings, the assistant and a directory of every area | Working |
| Sign-in | Passwordless email code, or Google / GitHub / Microsoft, via WorkOS (Supabase Auth during transition) | Working |
| Profile | Manual builder or AI import from a PDF/DOCX resume; completeness score and checklist | Working |
| Jobs | Search remote jobs imported from many boards ([job-ingestion.md](job-ingestion.md)) with filters; save; apply with a note; withdraw; track status | Working |
| Matching | Explainable match score per job (skills 40 %, experience 25 %, role 15 %, timezone 8 %, availability 7 %, rate 3 %, remote preference 2 %) with a rationale; ranked candidates for posters | Working |
| Hiring | Post and manage jobs, review applicants through a server-enforced pipeline, invite candidates | Working |
| Freelancing | Contracts with milestones (Offered → Signed → Active → Completed/Terminated), deliverables per milestone (commit SHA, document, demo link), accept or request changes | Working; no money moves through the platform |
| Network | Connections, member and organisation directories, contacts import with signed invites | Working |
| Feed and groups | Posts, reactions, comments, shares; groups with roles, moderation and private requests | Working |
| Messaging | Direct messages; project and group channels with threads, mentions, unread counts, mute, file attachments | Working (polling) |
| Meetings | Schedule with connections, passcode and waiting room, join a free Jitsi room or own link | Working; no built-in video |
| Projects | Boards, sprints, work items (task/bug/story/epic), labels, watchers, dependencies, activity; project workspace tabs | Working |
| Files | My files, shared, recent, starred, trash (retention), versions, sharing with roles, Office/PDF previews | Working |
| Documents | Docs, sheets, slides with comments, versions and sharing; DOCX/XLSX/PPTX import/export | Working |
| Demos | Project demo registry, sandboxed viewer, review notes | Working |
| AI assistant | Answers about your jobs, tasks, contracts, meetings; drafts text; creates items only after you confirm; metered allowance | Working when a free AI provider is configured |
| Notifications | In-app, email digests (Brevo), browser push; per-category preferences | Working |
| Search | One search across jobs, people, organisations, projects, files, documents, filtered by access | Working |
| Support | Tickets with a thread; safety reports prioritised | Working |
| Privacy | Data export, account deletion with retention rules ([privacy-and-data.md](privacy-and-data.md)) | Working |
| Paid plans | Pricing page, Stripe Checkout and Customer Portal, Settings > Billing; employer one-offs (Featured, Urgent, packs, boosts), sponsored jobs (pay-per-click), Hire / Hire Pro, candidate database, messaging and proposal credits, Premium (7-day trial), Freelancer Plus, profile boost, AI credit packs; paid placements always labelled ([billing.md](../operations/billing.md)) | Built; off until `BILLING_ENABLED` |
| Payments between members | Escrow and payouts for contracts | Off by design (`MARKETPLACE_PAYMENTS_ENABLED`) |
| Trending skills | Widget shows "Coming soon" behind `FEATURE_TRENDING_SKILLS` | Not built |

Public, indexable pages: home, `/remote-jobs`, `/jobs/<id>` (with schema.org JobPosting where the source
allows), privacy and terms, sitemap. Everything else is behind sign-in.
