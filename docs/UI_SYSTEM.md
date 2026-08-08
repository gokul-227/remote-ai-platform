# WorkMesh AI — UI & Design System Guidelines

## 1. Aesthetic Principles & Visual Tone
WorkMesh AI is designed to look and feel like a modern enterprise social and remote work ecosystem (drawing design inspiration from LinkedIn, Upwork, and Facebook while maintaining unique WorkMesh identity).

- **Typography**: Inter / Outfit sans-serif font stack.
- **Color Palette**: Dark enterprise theme with vibrant indigo/violet brand accents (`#4f46e5`, `#6366f1`), slate background surfaces (`#0f172a`, `#1e293b`), and subtle glassmorphic borders (`border-slate-800`).
- **Match Pill Conventions**:
  - `pill-match-high`: Score >= 85 (Emerald green badge)
  - `pill-match-medium`: Score 60-84 (Amber badge)
  - `pill-match-low`: Score < 60 (Rose badge)

## 2. Component Guidelines
- **Hand-Rolled Utility CSS**: Defined in `apps/web/src/app/globals.css` (Tailwind v4 `@import "tailwindcss";`). Custom utility classes include `.card-enterprise`, `.btn-primary-brand`, `.btn-secondary-brand`, `.badge-skill`.
- **States**: Every page and interactive component must handle 5 essential UI states:
  1. `LoadingState` (skeleton loaders)
  2. `EmptyState` (friendly zero-data messages with CTA)
  3. `ErrorState` (alert banners with retry options)
  4. `SuccessState` (clean feedback toasts/alerts)
  5. `PermissionDeniedState` (unauthorized role notice)

## 3. Responsive Layout & Navigation
- **Navigation Bar**: Persona-aware top header (switching between Engineer, Company, and Admin modes).
- **Responsive Layout**: Desktop-first layout with smooth flex/grid adaptations for tablet and mobile screens.
