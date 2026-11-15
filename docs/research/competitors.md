# Competitor and reference-product research (condensed)

Researched November 2026 from official documentation and read-only observation of the public products.
Only product concepts are recorded here; no account data. Used to shape features, not to copy designs.

| Product | Patterns we took | Where it landed |
| --- | --- | --- |
| LinkedIn | Profile + network + feed + jobs hub; preference-driven job lists with an editable "why"; job tracker; per-post visibility; recruiter quick replies | Profile, connections, feed, jobs with explainable match, application tracker |
| Upwork | Proposal → offer → contract → milestones → submit → approve / request changes; offers expire; only parties see the workroom | Contracts and deliverables (`contracts/lifecycle.py`); payments deliberately excluded |
| Facebook | Groups with admin/moderator roles, post and membership approval, public/private; report per post/comment | Groups moderation and private requests; reports queue |
| Slack | Channels and DMs, threads with "also send to channel", per-channel notification levels, mute, scheduled messages | Channels with threads, mentions, unread counts, mute, attachments |
| Jira | Work item types, statuses and transitions, boards, backlog, sprints, filters, watchers, dependencies | Project boards, sprints, work items with types, labels, watchers, dependency-loop refusal |
| Notion | Pages of blocks, nested pages inheriting permissions ("broadest access wins"), view/comment/edit levels | Documents with parent pages and inherited shares; databases/sites deferred |
| Google Drive, Dropbox, OneDrive | Viewer/commenter/editor, link scopes, folder inheritance, 30-day trash, version history and restore, starred/recent | Files app with shares, trash sweep, versions, stars |
| Microsoft Word/Excel/PowerPoint | Tracked changes, comments, version history, review/approval | Docs/sheets/slides with comments and versions; Office previews for deliverables |
| Zoom | Scheduling with passcode and waiting room; plan limits shown where they bite | Meetings with passcode and waiting room; external Jitsi room |
| Brave | Isolation, clear origin display, permission minimalism | Sandboxed demo viewer (http(s) only, private addresses rejected, no top navigation) |
| Jira Service Management, ServiceNow | Request queues, SLA timers, internal notes vs replies, incidents with severity and timeline | Support tickets with SLA; incidents module |
| Backstage | Catalogue of components with owners, runbooks, dependencies | Service catalogue in the staff console |
| Keycloak / Okta / Entra / WorkOS | Roles, session revocation, identity brokering, audit events | Staff roles, sign-out everywhere, WorkOS sign-in, security events |

## Principles drawn from the research

1. Explain ranking and limits in place (why this job matches; why an action is blocked).
2. Permissions inherit downward; the broadest grant wins; search never returns what the viewer cannot open.
3. State machines own transitions (contracts, applications, work items); the UI only offers legal moves.
4. Staff actions need a reason and leave an audit trail.
5. Do not build what a free external service already does well (video calls, payments).
