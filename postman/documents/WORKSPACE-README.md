# Remote AI Platform — Postman workspace

AI-powered remote work marketplace — Aggregate remote jobs, match professionals with AI, and connect talent with organizations.

This workspace is **generated from the API code in GitHub** (`make api-sync`). GitHub is the source of
truth: change the API, `postman/overrides/` or `postman/environments/` and open a pull request. Edits to
generated files are reported as drift by CI, and edits made only in a Postman cloud workspace are
overwritten by the next mirror.

| | |
| --- | --- |
| Requests | 182 (162 need a signed-in user) in the collection **Remote AI Platform** |
| Captured variables | 10 ids passed from one request to the next (see *Request dependencies*) |
| Environments | `local`, `dev`, `prod` |
| Spec | `postman/specs/` — the OpenAPI document the collection is generated from |
| Mock | `postman/mocks/` — run with `postman mock run postman/mocks/<name>/config.yaml` (port 4500) |
| Flows | `postman/flows/` — the main journeys as Postman Flows (defined in `postman/overrides/flows.yaml`) |

## Get started

1. **Open** — Postman 12+ → *Files* → *Open folder* → your clone of the repository. Everything here is read
   from your working copy; `git pull` brings in API changes.
2. **Choose an environment** (top right):
   - `local` — your machine. `make postman-stack` starts the API on :8000 with a local sign-in service whose
     code is always `123456`; requests sign in automatically (`auto_sign_in`).
   - `dev` — the dev deployment. Set `email`, `supabase_url` and `supabase_publishable_key` (from Infisical or
     your `.env`) as *current values*.
   - `prod` — production, **read-only**: requests that change data are skipped (`allow_writes` is `false`).
3. **Sign in** — run the *Sign in* folder: send the code, put the emailed code in `otp_code`, verify. Tokens
   are refreshed automatically before they expire and are never written to the repository.
4. **Run** — any request, a folder, or the whole collection (*Run collection*). Requests run in dependency
   order: ids created or listed earlier are reused later; a request whose ids are missing is skipped with a
   message telling you which request to run first.

## Rules

- Never put a token or password in a committed environment — CI rejects secrets with a value.
- Requests that end your session or delete your account only run when `allow_destructive` is `true`.
- Hand-written tests go in `postman/overrides/requests.yaml` (keyed by `METHOD /path`); they survive
  regeneration and run after the generated tests.
