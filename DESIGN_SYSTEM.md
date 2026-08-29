# Design System — Remote AI Platform Redesign

**Status of this document**: describes (a) the real current state of `apps/web`'s design system, verified by reading source, and (b) the proposed target system for the redesign. Nothing in section 2 onward has been implemented yet — this is a specification, not a changelog.

---

## 1. Current State (verified, as of this audit)

### 1.1 Existing tokens (`apps/web/src/app/globals.css`)
**Correction (2026-08-29): this section was written 2026-08-15 and is stale — dark mode now exists.** A full `:root[data-theme="dark"]` token block was added since, plus a Tailwind v4 `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));` declaration enabling `dark:` utility classes. Token hex values below have also drifted slightly from what's actually in the file (e.g. `--bg-page` is now `#F7F9FC`, not `#F3F2EF`) — treat this table as historical; read `globals.css` directly for current values.

| Category | Tokens |
|---|---|
| Surfaces | `--bg-page` (#F3F2EF), `--bg-surface` (#FFFFFF), `--bg-subtle`/`--surface-muted` (#F8FAFC), `--surface-elevated` |
| Borders | `--border-color` (#E5E7EB), `--border-hover` (#D1D5DB), `--border-strong` (#CBD5E1) |
| Brand | `--color-brand` (#0A66C2), `--color-brand-hover` (#004182), `--color-brand-light`/`--primary-soft` (#E8F3FF) |
| Status | `--color-info`/`--color-accent` (#0284C7) + soft, `--color-success` (#059669) + soft, `--color-warning` (#D97706) + soft, `--color-error`/`--color-danger` (#DC2626) + soft |
| AI accent | `--color-ai` (#6366F1), `--color-ai-soft` (#EEF2FF) |
| Text | `--text-main` (#0F172A), `--text-muted` (#475569), `--text-light` (#64748B) |
| Radius | `--radius-sm` 6px, `--radius-md` 8px, `--radius-card` 12px, `--radius-lg` 16px |
| Shadow | `--shadow-xs/sm/md` (reserved for dropdowns/popovers/dialogs only; the rest of the app uses border-based separation by design) |
| Focus | `--focus-ring` |
| Typography/spacing | **Not tokenized** — Tailwind's own default scale is used directly (deliberate, per an in-file comment) |

Built on these tokens: `.card-enterprise`, `.btn-primary-brand`/`.button-primary` (duplicate names for the same thing), `.btn-secondary-brand`, `.btn-subtle`, `.input-enterprise`, `.badge-ent` family, `.badge-enterprise` (alias of `.badge-ent`), `.pill-match-*`, `.badge-ai`, `.skeleton-box`.

**Known debt**: `tailwind.config.js` separately defines `primary`/`secondary`/`accent`/`background`/`foreground` theme colors with *different hex values* than the CSS variables above (e.g. `background: #f3f4f6` vs `--bg-page: #F3F2EF`) and is effectively dead — components consume the CSS variables via arbitrary-value classes, not these theme colors. There are also duplicate-name aliases already (`--surface-muted` = `--bg-subtle`, `.badge-enterprise` = `.badge-ent`) suggesting prior incremental additions without consolidation.

### 1.2 Existing components (`apps/web/src/components/`)
**30 components exist today**, not 150-200. Categorized:
- Form primitives (2 files, 4 exports): `Button`, `Input`/`Textarea`/`Select`
- Feedback/overlays (6): `Modal`, `Drawer`, `Toast`, `Skeleton` (+2 composed skeletons), `Progress`/`ProgressRing`, `EmptyState`
- Data display (4): `DataTable<T>`, `Badge`/`MatchPill`, `Card`/`CardHeader`/`CardBody`, `MatchScore` (AI match ring + factor bars)
- Navigation (5): `Sidebar`, `TopNavbar`, `MobileBottomNav`, `CommandPalette`, `Tabs`
- Cards/list items (7): `JobCard`, `CompanyCard`, `UserCard`, `PostCard`, `NotificationItem`, `MessageBubble`, `TrustBadge`
- Layout/shell (1): `LayoutShell`
- Auth guards (2): `RequireAuth`, `RequireRole`
- Providers (1): `QueryProvider`
- Identity (1): `Avatar`

### 1.3 Library reality check (this is what's ACTUALLY installed, per `package.json`)
| Requested in the brief | Installed today? |
|---|---|
| shadcn/ui | ❌ No — no `components.json`, no shadcn CLI output anywhere |
| Framer Motion | ❌ No |
| TanStack Query | ✅ Yes (`^5.66.0`) |
| TanStack Table | ❌ No (only Query is installed, not Table) |
| React Hook Form | ✅ Yes (`^7.54.2`) |
| Zod | ✅ Yes (`^3.24.2`) |
| Zustand | ❌ No |
| class-variance-authority (shadcn dependency) | ❌ No |

**This matters for the plan**: three of the seven libraries the brief specifies as "frontend architecture" (shadcn/ui, Framer Motion, Zustand) aren't in the codebase yet and TanStack Table is also absent. Adding them is a real, non-trivial decision — see §3.

---

## 2. The shadcn/ui Decision (must be made before any component work starts)

The brief asks for shadcn/ui. The repo has a working, visually-consistent, hand-rolled system instead. Two honest paths, not a false choice hidden by "just add shadcn":

**Option A — Adopt shadcn/ui as the new component foundation.**
shadcn components are copied into the repo as editable source and use `class-variance-authority` + Tailwind theme tokens (conventionally `bg-primary`, referencing `hsl(var(--primary))`). To make shadcn's generated components render on-brand without a visual regression, either:
  (a) bridge the existing CSS variables into real `tailwind.config` theme colors so shadcn's `bg-primary` etc. resolve correctly, or
  (b) re-theme each shadcn component's copied source to reference the existing `--color-brand` etc. variables directly (fully viable since shadcn code is owned, not a locked dependency).
This is real migration work per component category (forms, overlays, data display, nav) — not a drop-in.

**Option B — Keep and extend the current hand-rolled system.**
It already has real strengths: consistent, already proven across ~40 redesigned pages in production, zero migration risk, no new dependency surface. Its gaps (no dark mode, no CVA-style variant composition, some duplicate-alias debt) can be closed directly without introducing shadcn at all.

**Recommendation**: Option B, extended — keep the existing token system as the single source of truth (retire the dead `tailwind.config.js` palette), add dark-mode variants to every token, adopt a CVA-based variant pattern for the existing 30 components (this gets shadcn's main ergonomic benefit — consistent variant APIs — without a wholesale swap), and reserve introducing actual shadcn/ui components for genuinely new component categories this redesign needs that don't exist today (command palette already exists; combobox, kanban board, and data-table-with-sorting do not) rather than replacing what already works. This is a recommendation for the user to confirm, not a decision made unilaterally — flagging it explicitly rather than silently picking one.

---

## 3. Target Design Tokens (proposed — not yet implemented)

Extend, don't replace, the existing token names so ~40 already-redesigned pages don't need a rewrite:

```css
:root {
  /* existing tokens carried forward unchanged */
  --bg-page: #F3F2EF;
  --bg-surface: #FFFFFF;
  --color-brand: #0A66C2;
  /* ...unchanged... */

  /* new: 8px grid, formalized (currently implicit via Tailwind defaults) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px; --space-16: 64px;

  /* new: typographic scale, formalized (Inter, already the likely system font via Tailwind defaults — confirm in implementation) */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
}

/* new: dark mode — does not exist today, this is net-new work */
:root[data-theme="dark"] {
  --bg-page: #0B0F17;
  --bg-surface: #131826;
  --text-main: #F1F5F9;
  --text-muted: #94A3B8;
  --border-color: #1F2937;
  /* brand/status colors stay recognizable but adjusted for contrast on dark surfaces */
}
```

## 4. Component Inventory — Target State

The brief's "150-200 components" target is not grounded in what a product at this scope actually needs; treating a large number as the goal risks manufacturing components to hit a count. Instead, here is a realistic, needs-driven inventory: **30 existing + ~70 net-new = ~100 components**, organized by the product surfaces the brief actually describes. This is the honest ceiling for a system that stays coherent and maintainable; the IMPLEMENTATION_PLAN.md phases this in incrementally, not all at once.

| Category | Existing | Net-new needed | Examples of net-new |
|---|---|---|---|
| Form primitives | 4 | +6 | Combobox, multi-select, date picker, file dropzone, rich-text editor, form-level `Zod` error summary |
| Navigation | 5 | +4 | Workspace switcher, universal search overlay (distinct from CommandPalette), breadcrumbs, right contextual panel |
| Feedback/overlays | 6 | +3 | Confirm-dialog wrapper, inline banner, contextual AI side-panel shell |
| Data display | 4 | +8 | Sortable/paginated data table (needs TanStack Table), Kanban board + card, Gantt/timeline, activity feed item, chart wrappers (line/bar/donut), stat tile |
| Cards | 7 | +6 | Feed post variants (article/poll/event), project card, proposal card, milestone card, candidate pipeline card, org/company admin card |
| Social | 0 | +10 | Comment thread, reaction picker, share sheet, group card, event card, poll widget, follow button, connection-request card |
| Freelance/marketplace | 0 | +8 | Proposal form, milestone tracker, escrow status widget, contract summary card, review/rating widget, dispute banner |
| AI panels | 1 (MatchScore) | +7 | Match-explanation panel, resume-optimizer panel, cover-letter generator, interview-prep panel, candidate-ranking panel, task-generator panel, meeting-summary panel |
| Wallet/payments | 0 | +6 | Balance card, transaction row, payout method form, invoice preview, escrow release confirm, payment method selector |
| Admin-specific | ~3 (reused) | +6 | Audit log row, feature-flag toggle row, moderation queue card, system-health tile, org detail panel, user detail panel |

**Total realistic target: ~100 components delivered incrementally across the phases in IMPLEMENTATION_PLAN.md**, not built upfront.

## 5. Design Principles (carried from the brief, unchanged)
Simplicity, clarity, trust, speed, depth, accessibility. Typography: Inter. 8px spacing grid. Responsive. Light + dark mode. Enterprise blue palette (already established via `--color-brand`).

## 6. App Shell (target)
Persistent top nav + left sidebar + main content + right contextual panel + universal search + notifications + workspace switcher + AI assistant entry point. **Current state**: top nav, left sidebar, mobile bottom nav, and a command palette already exist and work. Net-new: workspace switcher (doesn't exist — there's no workspace concept yet, see PRODUCT_AUDIT.md §user model), right contextual panel (a `RightSidebar` widget exists but is page-specific, not a generic contextual panel framework), and a persistent AI assistant entry point (no chat/assistant UI exists anywhere today).
