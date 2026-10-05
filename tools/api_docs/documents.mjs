// Workspace documents (postman/documents/*.md), generated from the same
// analysis as the collection so they never disagree with it.

const code = (text) => `\`${text}\``;
const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

function readme({ spec, title, mockPort, entries, analysis }) {
  const secured = entries.filter((e) => e.info.secured).length;
  return `# ${title} — Postman workspace

${spec.info.description ?? ""}

This workspace is **generated from the API code in GitHub** (\`make api-sync\`). GitHub is the source of
truth: change the API, \`postman/overrides/\` or \`postman/environments/\` and open a pull request. Edits to
generated files are reported as drift by CI, and edits made only in a Postman cloud workspace are
overwritten by the next mirror.

| | |
| --- | --- |
| Requests | ${entries.length} (${secured} need a signed-in user) in the collection **${title}** |
| Captured variables | ${analysis.producers.size} ids passed from one request to the next (see *Request dependencies*) |
| Environments | \`local\`, \`dev\`, \`prod\` |
| Spec | \`postman/specs/\` — the OpenAPI document the collection is generated from |
| Mock | \`postman/mocks/\` — run with \`postman mock run postman/mocks/<name>/config.yaml\` (port ${mockPort}) |
| Flows | \`postman/flows/\` — the main journeys as Postman Flows (defined in \`postman/overrides/flows.yaml\`) |

## Get started

1. **Open** — Postman 12+ → *Files* → *Open folder* → your clone of the repository. Everything here is read
   from your working copy; \`git pull\` brings in API changes.
2. **Choose an environment** (top right):
   - \`local\` — your machine. \`make postman-stack\` starts the API on :8000 with a local sign-in service whose
     code is always \`123456\`; requests sign in automatically (\`auto_sign_in\`).
   - \`dev\` — the dev deployment. Set \`email\`, \`supabase_url\` and \`supabase_publishable_key\` (from Infisical or
     your \`.env\`) as *current values*.
   - \`prod\` — production, **read-only**: requests that change data are skipped (\`allow_writes\` is \`false\`).
3. **Sign in** — run the *Sign in* folder: send the code, put the emailed code in \`otp_code\`, verify. Tokens
   are refreshed automatically before they expire and are never written to the repository.
4. **Run** — any request, a folder, or the whole collection (*Run collection*). Requests run in dependency
   order: ids created or listed earlier are reused later; a request whose ids are missing is skipped with a
   message telling you which request to run first.

## Rules

- Never put a token or password in a committed environment — CI rejects secrets with a value.
- Requests that end your session or delete your account only run when \`allow_destructive\` is \`true\`.
- Hand-written tests go in \`postman/overrides/requests.yaml\` (keyed by \`METHOD /path\`); they survive
  regeneration and run after the generated tests.
`;
}

function reference({ entries }) {
  const lines = ["# API reference", "", "Every request in the collection, in run order.", ""];
  let folder = null;
  for (const entry of entries) {
    if (entry.folder !== folder) {
      folder = entry.folder;
      lines.push(`## ${folder}`, "", "| Request | Method & path | Auth | Needs | Sets |", "| --- | --- | --- | --- | --- |");
    }
    const { info } = entry;
    lines.push(
      `| ${cell(entry.name)} | ${code(`${info.method} ${info.path}`)} | ${info.secured ? "Bearer" : "Public"} | ${info.needs.map((v) => code(`{{${v}}}`)).join(", ")} | ${info.sets.map((s) => code(`{{${s.variable}}}`)).join(", ")} |`,
    );
    const next = entries[entries.indexOf(entry) + 1];
    if (!next || next.folder !== folder) lines.push("");
  }
  return lines.join("\n");
}

function dependencies({ entries, analysis }) {
  const label = new Map(entries.map((e) => [e.info.key, `${e.folder} › ${e.name}`]));
  const lines = [
    "# Request dependencies",
    "",
    "Path variables are captured automatically: a list or create request stores the id of the item it returns,",
    "and every request under that resource reuses it. Run the *Set by* request first (a full collection run",
    "already does — folders and requests are ordered so producers come first).",
    "",
    "| Variable | Set by | Used by |",
    "| --- | --- | --- |",
  ];
  const users = new Map();
  for (const entry of entries) for (const v of entry.info.needs) users.set(v, [...(users.get(v) ?? []), label.get(entry.info.key)]);
  const all = [...new Set([...analysis.producers.keys(), ...users.keys()])].sort();
  for (const variable of all) {
    const setBy = (analysis.producers.get(variable) ?? []).map((k) => label.get(k)).join("<br>") || "*(set it in your environment)*";
    lines.push(`| ${code(`{{${variable}}}`)} | ${setBy} | ${(users.get(variable) ?? []).join("<br>")} |`);
  }
  lines.push(
    "",
    "## Session",
    "",
    "| Variable | Set by | Used by |",
    "| --- | --- | --- |",
    `| ${code("{{access_token}}")} | Sign in › Verify code, or automatically (collection script) | every request that needs a signed-in user |`,
    `| ${code("{{refresh_token}}")} | Sign in › Verify code / Refresh session | the collection script, to renew the token |`,
  );
  return `${lines.join("\n")}\n`;
}

function testing({ entries }) {
  const withSchema = entries.filter((e) => e.info.responseSchema).length;
  return `# Testing

Every request carries generated tests (from the OpenAPI document) and may add hand-written ones.

## Generated tests (all ${entries.length} requests)

| Test | When |
| --- | --- |
| No server error (5xx) — a 503 that explains itself (AI not configured, payments off) is allowed | always |
| Responds within \`max_response_ms\` | always (per environment: local 3 s, dev 30 s for cold starts, prod 10 s) |
| Status is the documented success code | on 2xx |
| Responds with JSON and the body matches the OpenAPI response schema | on 2xx, for the ${withSchema} requests that document a response schema |
| Error response explains the failure (\`error\` or \`detail\`) | on 4xx |
| Stores returned ids for later requests | on 2xx, for list/create requests |

Before each request, generated guards skip it — with a console message — when the environment is read-only
(\`allow_writes\`), when it would end the session or delete the account (\`allow_destructive\`), or when an id it
needs has not been captured yet.

## Run from a terminal (Postman CLI)

\`\`\`bash
make postman-stack                 # API on :8000 + local sign-in (code 123456), needs Docker
make postman-test                  # whole collection, environment "local"
make postman-test ENV=dev          # against dev (set email/supabase values first)
make postman-stack-down
\`\`\`

CI runs the whole collection against a fresh stack on every pull request that touches the API.
`;
}

export function buildDocuments(context) {
  return {
    "WORKSPACE-README.md": readme(context),
    "API reference.md": reference(context),
    "Request dependencies.md": dependencies(context),
    "Testing.md": testing(context),
  };
}
