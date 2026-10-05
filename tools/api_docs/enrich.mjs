// Everything the generated collection says about each request beyond what the
// converter writes: documentation, variables, dependencies, guards and tests.
// Pure functions over the OpenAPI document and the v2.1 collection, so the
// output is deterministic and unit-testable.

const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const STRIP_KEYWORDS = new Set([
  "title", "description", "examples", "example", "format", "discriminator", "deprecated",
  "readOnly", "writeOnly", "contentEncoding", "contentMediaType", "default", "xml", "externalDocs",
]);

export const operationKey = (method, urlPath) => `${method.toUpperCase()} ${urlPath}`;

// ── OpenAPI analysis ────────────────────────────────────────────────────────

function resolve(spec, schema) {
  let current = schema ?? {};
  const seen = new Set();
  while (current.$ref && !seen.has(current.$ref)) {
    seen.add(current.$ref);
    current = spec.components.schemas[current.$ref.split("/").pop()] ?? {};
  }
  return current;
}

function jsonSchemaOf(content) {
  return content?.["application/json"]?.schema;
}

// For responses without a documented schema: the item's id, the first item of
// a returned list, or the first item of the first list property.
const ANY_ID = "(body.id ?? (Array.isArray(body) ? body[0]?.id : Object.values(body).find((v) => Array.isArray(v) && v[0]?.id)?.[0]?.id))";

/** How to read a resource id out of a response body, or null when it has none. */
function idExpression(spec, schema) {
  if (!schema) return ANY_ID;
  const s = resolve(spec, schema);
  if (s.properties?.id) return "body.id";
  if (s.type === "array" && resolve(spec, s.items).properties?.id) return "body[0]?.id";
  for (const [name, property] of Object.entries(s.properties ?? {})) {
    const p = resolve(spec, property);
    if (p.type === "array" && resolve(spec, p.items).properties?.id) return `body.${name}?.[0]?.id`;
  }
  return null;
}

/** Draft-07 JSON schema for Postman's validator: refs inlined as definitions, annotations dropped. */
export function validationSchema(spec, schema) {
  const definitions = {};
  const pending = [];
  const rewrite = (node) => {
    if (Array.isArray(node)) return node.map(rewrite);
    if (!node || typeof node !== "object") return node;
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (STRIP_KEYWORDS.has(key)) continue;
      if (key === "$ref") {
        const name = value.split("/").pop();
        if (!(name in definitions)) {
          definitions[name] = null;
          pending.push(name);
        }
        out.$ref = `#/definitions/${name}`;
      } else if (key === "properties") {
        out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
      } else {
        out[key] = rewrite(value);
      }
    }
    return out;
  };
  const root = rewrite(schema);
  while (pending.length) {
    const name = pending.shift();
    definitions[name] = rewrite(spec.components.schemas[name] ?? {});
  }
  return Object.keys(definitions).length ? { ...root, definitions: Object.fromEntries(Object.entries(definitions).sort()) } : root;
}

/**
 * Per operation: the variables it needs, the variables it can set, and its
 * documented success responses. Producers of `x_id` are the list/create
 * operations on the collection path one level above `/{x_id}`.
 */
export function analyse(spec) {
  const operations = new Map();
  for (const [urlPath, item] of Object.entries(spec.paths)) {
    for (const method of METHODS.filter((m) => item[m])) {
      const op = item[method];
      const parameters = [...(item.parameters ?? []), ...(op.parameters ?? [])];
      const success = Object.keys(op.responses).filter((c) => c.startsWith("2")).sort();
      const schemaCode = success.find((c) => jsonSchemaOf(op.responses[c].content));
      operations.set(operationKey(method, urlPath), {
        key: operationKey(method, urlPath),
        method: method.toUpperCase(),
        path: urlPath,
        op,
        parameters,
        success,
        responseSchema: schemaCode ? jsonSchemaOf(op.responses[schemaCode].content) : null,
        secured: (op.security ?? spec.security ?? []).length > 0,
        needs: parameters.filter((p) => p.in === "path").map((p) => p.name),
        sets: [],
      });
    }
  }
  const producers = new Map(); // variable -> [operation keys]
  for (const info of operations.values()) {
    for (const variable of info.needs) {
      const collectionPath = info.path.slice(0, info.path.indexOf(`/{${variable}}`));
      for (const method of ["post", "get"]) {
        const candidate = operations.get(operationKey(method, collectionPath));
        if (!candidate) continue;
        const expression = idExpression(spec, candidate.responseSchema);
        if (!expression || candidate.sets.some((s) => s.variable === variable)) continue;
        candidate.sets.push({ variable, expression });
        const list = producers.get(variable) ?? [];
        if (!list.includes(candidate.key)) list.push(candidate.key);
        producers.set(variable, list);
      }
    }
  }
  for (const info of operations.values()) info.sets.sort((a, b) => a.variable.localeCompare(b.variable));
  return { operations, producers };
}

// ── Request body / parameters ───────────────────────────────────────────────

/** Point id fields of a JSON body at the variables that hold them. */
export function linkBody(raw, variables) {
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return raw;
  let changed = false;
  for (const key of Object.keys(body)) {
    if (variables.has(key) && typeof body[key] === "string") {
      body[key] = `{{${key}}}`;
      changed = true;
    }
  }
  return changed ? JSON.stringify(body, null, 2) : raw;
}

// ── Scripts ─────────────────────────────────────────────────────────────────

const js = (value) => JSON.stringify(value);

export function preRequestScript(info, names, guards) {
  const lines = [`// Generated from OpenAPI (${info.key}) -- edit the API or postman/overrides/, not this script.`];
  if (info.method !== "GET" && info.method !== "HEAD") {
    lines.push(
      'if (pm.environment.get("allow_writes") !== "true") {',
      '  console.log("Skipped: this environment is read-only (allow_writes is not \\"true\\").");',
      "  pm.execution.skipRequest();",
      "}",
    );
  }
  if (guards.includes("destructive")) {
    lines.push(
      'if (pm.environment.get("allow_destructive") !== "true") {',
      '  console.log("Skipped: ends your session or deletes your account (set allow_destructive to \\"true\\").");',
      "  pm.execution.skipRequest();",
      "}",
    );
  }
  for (const variable of info.needs) {
    const from = names(variable);
    lines.push(
      `if (!pm.variables.get(${js(variable)})) {`,
      `  console.log(${js(`Skipped: {{${variable}}} is not set${from ? ` -- run ${from} first` : ""}.`)});`,
      "  pm.execution.skipRequest();",
      "}",
    );
  }
  return lines;
}

export function testScript(spec, info) {
  const lines = [
    `// Generated from OpenAPI (${info.key}) -- edit the API or postman/overrides/, not this script.`,
    'const maxMs = Number(pm.variables.get("max_response_ms") || 5000);',
    "// A 503 that explains itself is deliberate (AI not configured, payments switched off).",
    "const explained = (() => { try { const b = pm.response.json(); return Boolean(b.error ?? b.detail); } catch (e) { return false; } })();",
    'pm.test("No server error (5xx), except an explained 503", () => {',
    "  pm.expect(pm.response.code < 500 || (pm.response.code === 503 && explained), `status ${pm.response.code}`).to.be.true;",
    "});",
    "pm.test(`Responds within ${maxMs} ms`, () => pm.expect(pm.response.responseTime).to.be.below(maxMs));",
    "if (pm.response.code >= 200 && pm.response.code < 300) {",
    `  pm.test(${js(`Status is the documented success code (${info.success.join(", ") || "2xx"})`)}, () => {`,
    `    pm.expect(${js(info.success.map(Number))}).to.include(pm.response.code);`,
    "  });",
  ];
  if (info.responseSchema) {
    lines.push(
      '  pm.test("Responds with JSON", () => pm.expect(pm.response.headers.get("Content-Type")).to.match(/application\\/json/));',
      `  const schema = ${JSON.stringify(validationSchema(spec, info.responseSchema))};`,
      '  pm.test("Body matches the OpenAPI response schema", () => pm.response.to.have.jsonSchema(schema));',
    );
  }
  if (info.sets.length) {
    lines.push("  const body = pm.response.json();");
    for (const { variable, expression } of info.sets) {
      lines.push(
        `  const ${variable} = ${expression};`,
        `  if (${variable}) pm.environment.set(${js(variable)}, String(${variable}));`,
      );
    }
  }
  lines.push(
    "} else {",
    '  pm.test("Error response explains the failure (error or detail)", () => {',
    "    const body = pm.response.json();",
    '    pm.expect(body.error ?? body.detail, "error/detail").to.exist;',
    "  });",
    "}",
  );
  return lines;
}

// ── Documentation ───────────────────────────────────────────────────────────

const cell = (text) => String(text ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ");

function schemaType(spec, schema) {
  const s = resolve(spec, schema);
  if (schema?.$ref) return schema.$ref.split("/").pop();
  if (s.anyOf) return s.anyOf.map((x) => schemaType(spec, x)).join(" \\| ");
  if (s.type === "array") return `${schemaType(spec, s.items)}[]`;
  if (s.enum) return s.enum.map((e) => `\`${e}\``).join(", ");
  return s.format ? `${s.type} (${s.format})` : s.type ?? "any";
}

export function describe(spec, info, names, guards) {
  const { op } = info;
  const out = [];
  if (op.description) out.push(op.description.trim(), "");
  out.push(`\`${info.method} ${info.path}\``, "");
  out.push(
    `**Authorization:** ${
      info.secured
        ? "Bearer `{{access_token}}` (Supabase session). Run *Sign in* first, or let the collection sign in for you where `auto_sign_in` is on."
        : "none (public)."
    }`,
    "",
  );

  const table = (title, rows, headings) => {
    if (!rows.length) return;
    out.push(`**${title}**`, "", `| ${headings.join(" | ")} |`, `| ${headings.map(() => "---").join(" | ")} |`);
    for (const row of rows) out.push(`| ${row.map(cell).join(" | ")} |`);
    out.push("");
  };
  const param = (p) => [
    `\`${p.name}\``,
    schemaType(spec, p.schema),
    p.required ? "yes" : "no",
    p.schema?.default !== undefined ? `\`${JSON.stringify(p.schema.default)}\`` : "",
    p.description ?? "",
  ];
  table(
    "Path variables",
    info.parameters.filter((p) => p.in === "path").map((p) => [`\`{{${p.name}}}\``, schemaType(spec, p.schema), names(p.name) ?? "set it in your environment", p.description ?? ""]),
    ["Variable", "Type", "Set by", "Description"],
  );
  table("Query parameters (optional ones are disabled until you enable them)", info.parameters.filter((p) => p.in === "query").map(param), ["Name", "Type", "Required", "Default", "Description"]);
  table("Headers", info.parameters.filter((p) => p.in === "header").map(param), ["Name", "Type", "Required", "Default", "Description"]);

  const bodySchema = jsonSchemaOf(op.requestBody?.content) ?? op.requestBody?.content?.["multipart/form-data"]?.schema;
  if (bodySchema) {
    const s = resolve(spec, bodySchema);
    const contentType = Object.keys(op.requestBody.content)[0];
    const required = new Set(s.required ?? []);
    table(
      `Request body (${contentType}${bodySchema.$ref ? `, ${bodySchema.$ref.split("/").pop()}` : ""})`,
      Object.entries(s.properties ?? {}).map(([name, p]) => [`\`${name}\``, schemaType(spec, p), required.has(name) ? "yes" : "no", resolve(spec, p).description ?? ""]),
      ["Field", "Type", "Required", "Description"],
    );
  }
  table(
    "Responses",
    Object.entries(op.responses).map(([code, r]) => [code, r.description ?? "", jsonSchemaOf(r.content) ? schemaType(spec, jsonSchemaOf(r.content)) : ""]),
    ["Status", "Meaning", "Body"],
  );

  const dependsOn = info.needs.map((v) => `\`{{${v}}}\` — ${names(v) ?? "not produced by any request; set it in your environment"}`);
  if (dependsOn.length) out.push("**Depends on**", "", ...dependsOn.map((d) => `- ${d}`), "");
  if (info.sets.length) out.push("**Sets for later requests**", "", ...info.sets.map((s) => `- \`{{${s.variable}}}\``), "");

  const tests = ["No server error (5xx), except a 503 that explains itself (AI or payments switched off)", "Responds within `max_response_ms`", `On success: status is ${info.success.join(" or ") || "2xx"}`];
  if (info.responseSchema) tests.push("On success: JSON body matches the OpenAPI response schema");
  tests.push("On failure: the error body says why (`error` or `detail`)");
  out.push("**Tests**", "", ...tests.map((t) => `- ${t}`), "");
  const skips = [];
  if (!["GET", "HEAD"].includes(info.method)) skips.push("the environment is read-only (`allow_writes` is not `true`)");
  if (guards.includes("destructive")) skips.push("`allow_destructive` is not `true` — it ends your session or deletes your account");
  if (info.needs.length) skips.push("a variable it depends on is not set yet");
  if (skips.length) out.push("**Skipped when**", "", ...skips.map((s) => `- ${s}`), "");
  return out.join("\n").trim();
}

// ── Collection-level scripts ────────────────────────────────────────────────

export const COLLECTION_PRE_REQUEST = `// Generated: keeps {{access_token}} valid for every request that uses it.
// 1. A token that expires within a minute is refreshed with {{refresh_token}}.
// 2. Without one, and only where auto_sign_in is "true" (local, whose sign-in
//    code is fixed), it signs in as {{email}} with {{otp_code}}.
const usesToken = pm.request.auth && pm.request.auth.type === "bearer";
const supabase = pm.environment.get("supabase_url");
const key = pm.environment.get("supabase_publishable_key");

function expiresAt(token) {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload)).exp * 1000;
  } catch (error) {
    return 0;
  }
}

function auth(path, body, done) {
  pm.sendRequest({
    url: supabase + "/auth/v1/" + path,
    method: "POST",
    header: { "Content-Type": "application/json", apikey: key },
    body: { mode: "raw", raw: JSON.stringify(body) },
  }, (error, response) => done(!error && response.code === 200 ? response.json() : null));
}

function keep(session) {
  if (!session || !session.access_token) return false;
  pm.environment.set("access_token", session.access_token);
  pm.environment.set("refresh_token", session.refresh_token);
  return true;
}

const token = pm.environment.get("access_token");
if (usesToken && supabase && key && !(token && expiresAt(token) > Date.now() + 60000)) {
  const email = pm.environment.get("email");
  const code = pm.environment.get("otp_code");
  const signIn = () => {
    if (pm.environment.get("auto_sign_in") !== "true" || !email || !code) {
      console.log("No valid access_token: run Sign in first.");
      return;
    }
    auth("otp", { email, create_user: true }, () =>
      auth("verify", { type: "email", email, token: code }, (session) => {
        if (!keep(session)) console.log("Automatic sign-in failed; run Sign in.");
      }));
  };
  const refresh = pm.environment.get("refresh_token");
  if (refresh) auth("token?grant_type=refresh_token", { refresh_token: refresh }, (s) => keep(s) || signIn());
  else signIn();
}`;

// ── Ordering ────────────────────────────────────────────────────────────────

/** Producers before consumers inside a folder; deletes last. */
export function requestRank(info) {
  const onCollection = !info.path.endsWith("}");
  if (info.method === "POST" && onCollection) return 0;
  if (info.method === "GET" && onCollection) return 1;
  if (info.method === "GET") return 2;
  if (info.method === "DELETE") return 9;
  return 3;
}

/** Folder order: folders that produce variables before the folders that need them. */
export function orderFolders(folders, folderNeeds, folderSets) {
  const index = new Map(folders.map((f, i) => [f, i]));
  const ordered = [];
  const placed = new Set();
  const visit = (folder, stack) => {
    if (placed.has(folder) || stack.has(folder)) return;
    stack.add(folder);
    const deps = folders.filter((other) => other !== folder && [...(folderNeeds.get(folder) ?? [])].some((v) => folderSets.get(other)?.has(v)));
    for (const dep of deps.sort((a, b) => index.get(a) - index.get(b))) visit(dep, stack);
    stack.delete(folder);
    placed.add(folder);
    ordered.push(folder);
  };
  for (const folder of folders) visit(folder, new Set());
  return ordered;
}
