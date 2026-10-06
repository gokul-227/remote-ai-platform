// OpenAPI -> everything under postman/ that Postman reads, with official tooling:
//   openapi-to-postmanv2 (Postman's converter)  -> v2.1 collection, in a temp dir only
//   postman collection migrate (Postman CLI)    -> Collection v3 YAML
//   postman mock generate (Postman CLI)         -> local mock server
//   postman collection/environment lint         -> schema validation
// plus, from the OpenAPI document (enrich.mjs): per-request documentation,
// variables, dependency wiring, guards and tests; workspace documents; the spec.
//
//   node tools/api_docs/postman.mjs           regenerate the generated parts of postman/
//   node tools/api_docs/postman.mjs --check   fail when they are stale or invalid
//
// Generated (never edit): collections/<title>/, globals/, specs/, mocks/, documents/.
// Hand-maintained: environments/ (local, dev, prod) and overrides/ -- tests,
// scripts, headers and guards for generated requests in requests.yaml, and
// whole folders of v3 requests (e.g. "Sign in/") copied into the collection.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { buildDocuments } from "./documents.mjs";
import { buildFlows } from "./flows.mjs";
import {
  COLLECTION_PRE_REQUEST,
  analyse,
  describe,
  linkBody,
  operationKey,
  orderFolders,
  preRequestScript,
  requestRank,
  testScript,
} from "./enrich.mjs";

const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Overridable so tests can run the real pipeline against fixture specs.
const ROOT = path.resolve(process.env.DOCS_SYNC_ROOT ?? path.join(TOOLS, ".."));
const OPENAPI = path.join(ROOT, "docs/api/openapi.yaml");
const POSTMAN = path.join(ROOT, "postman");
const OVERRIDES_DIR = path.join(POSTMAN, "overrides");
const OVERRIDES = path.join(OVERRIDES_DIR, "requests.yaml");
const FLOWS = path.join(OVERRIDES_DIR, "flows.yaml");
const ENVIRONMENTS = path.join(POSTMAN, "environments");
const CLI = path.join(TOOLS, "node_modules/.bin/postman");
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
const FIXED_TIME = Date.UTC(2026, 0, 1);
const MOCK_PORT = 4500;

// ── Deterministic example data ──────────────────────────────────────────────
// The converter fakes bodies/examples with json-schema-faker, which draws from
// Math.random and the clock. Reseed per schema (from the schema's own content)
// and freeze the clock, so output depends only on that schema: adding one
// endpoint never reshuffles the rest.
function installSeededFaker() {
  const require = createRequire(path.join(TOOLS, "package.json"));
  const fakerPath = require.resolve("openapi-to-postmanv2/assets/json-schema-faker.js");
  const faker = require(fakerPath);
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [FIXED_TIME]));
    }
    static now() {
      return FIXED_TIME;
    }
  }
  const seeded = function (schema, ...rest) {
    let seed = createHash("sha256").update(JSON.stringify(schema) ?? "").digest().readUInt32LE(0);
    const original = Math.random;
    Math.random = () => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    globalThis.Date = FixedDate;
    try {
      return faker.call(this, schema, ...rest);
    } finally {
      Math.random = original;
      globalThis.Date = RealDate;
    }
  };
  Object.assign(seeded, faker);
  // The faker captured Math.random as its `random` option at load time; route
  // it through the (per-call seeded) global instead.
  faker.option({ random: () => Math.random() });
  require.cache[fakerPath].exports = seeded;
  return require("openapi-to-postmanv2");
}

function convert(converter, spec) {
  return new Promise((resolve, reject) => {
    converter.convertV2(
      { type: "string", data: spec },
      {
        folderStrategy: "Tags",
        requestNameSource: "Fallback",
        // Schema-valid example values (seeded above), so bodies can be sent as-is.
        parametersResolution: "Example",
        includeAuthInfoInExample: true,
        // Optional params are listed but disabled until someone needs them.
        enableOptionalParameters: false,
      },
      (error, result) => {
        if (error) return reject(error);
        if (!result.result) return reject(new Error(result.reason));
        resolve(result.output[0].data);
      },
    );
  });
}

// ── v2.1 enrichment (before migration) ──────────────────────────────────────

function requestKey(request) {
  const segments = request.url.path.map((s) => (s.startsWith(":") ? `{${s.slice(1)}}` : s));
  return operationKey(request.method, `/${segments.join("/")}`);
}

function toEvents(lines, scripts, listen) {
  const extra = scripts.filter((s) => s.type === listen).map((s) => s.code.trimEnd());
  if (!lines.length && !extra.length) return [];
  const exec = [...lines];
  for (const code of extra) {
    // Hand-written checks assert on real data, so they do not run against the mock.
    const body = listen === "afterResponse" ? ['if (pm.variables.get("mock_run") !== "true") {', ...code.split("\n").map((l) => (l ? `  ${l}` : l)), "}"] : code.split("\n");
    exec.push("", "// ── Hand-written (postman/overrides/requests.yaml) ──", ...body);
  }
  return [{ listen: listen === "beforeRequest" ? "prerequest" : "test", script: { type: "text/javascript", exec } }];
}

function checkOverride(key, override) {
  const known = new Set(["scripts", "headers", "query", "guard"]);
  for (const field of Object.keys(override)) if (!known.has(field)) throw new Error(`override "${key}": unknown field "${field}"`);
  for (const script of override.scripts ?? []) {
    if (!["beforeRequest", "afterResponse"].includes(script.type)) throw new Error(`override "${key}": script type must be beforeRequest or afterResponse`);
  }
  if (override.guard && override.guard !== "destructive") throw new Error(`override "${key}": guard must be "destructive"`);
}

function enrich(collection, spec, overrides) {
  const renamed = JSON.parse(
    JSON.stringify(collection).replaceAll("{{baseUrl}}", "{{base_url}}").replaceAll("{{bearerToken}}", "{{access_token}}"),
  );
  renamed.variable = [{ key: "base_url", value: "http://localhost:8000", type: "string" }];
  const analysis = analyse(spec);
  const { operations, producers } = analysis;
  const variables = new Set(producers.keys());

  // Requests that share a name in one folder (the health routes are mounted
  // at / and /api/v1) are told apart by their path, so names stay unique.
  for (const folder of renamed.item) {
    const counts = new Map();
    for (const item of folder.item ?? []) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
    const mount = (item) => (requestKey(item.request).split(" ")[1].startsWith("/api/v1/") ? "API v1" : "root");
    const words = (item) => requestKey(item.request).split(" ")[1].split("/").filter(Boolean).join(" ");
    const duplicated = (folder.item ?? []).filter((item) => counts.get(item.name) > 1);
    const byMount = new Map();
    for (const item of duplicated) byMount.set(`${item.name}|${mount(item)}`, (byMount.get(`${item.name}|${mount(item)}`) ?? 0) + 1);
    for (const item of duplicated) {
      item.name = `${item.name} (${byMount.get(`${item.name}|${mount(item)}`) > 1 ? words(item) : mount(item)})`;
    }
  }

  // Folder › request names, for documentation and skip messages.
  const label = new Map();
  for (const folder of renamed.item) for (const item of folder.item ?? []) label.set(requestKey(item.request), `${folder.name} › ${item.name}`);
  const names = (variable) => (producers.get(variable) ?? []).map((k) => `"${label.get(k)}"`).join(" or ") || null;

  const pending = new Set(Object.keys(overrides.requests ?? {}));
  const folderNeeds = new Map();
  const folderSets = new Map();
  for (const folder of renamed.item) {
    folderNeeds.set(folder.name, new Set());
    folderSets.set(folder.name, new Set());
    const ranked = (folder.item ?? []).map((item, index) => {
      const key = requestKey(item.request);
      const info = operations.get(key);
      if (!info) throw new Error(`converter produced ${key}, which is not in the OpenAPI document`);
      const override = overrides.requests?.[key] ?? {};
      pending.delete(key);
      checkOverride(key, override);
      const guards = override.guard ? [override.guard] : [];
      info.needs.forEach((v) => folderNeeds.get(folder.name).add(v));
      info.sets.forEach((s) => folderSets.get(folder.name).add(s.variable));

      const request = item.request;
      for (const variable of request.url.variable ?? []) variable.value = `{{${variable.key}}}`;
      for (const query of request.url.query ?? []) if (variables.has(query.key)) query.value = `{{${query.key}}}`;
      if (request.body?.mode === "raw") request.body.raw = linkBody(request.body.raw, variables);
      for (const [name, value] of Object.entries(override.query ?? {})) {
        const query = (request.url.query ?? []).find((q) => q.key === name);
        if (!query) throw new Error(`override "${key}": no query parameter "${name}"`);
        query.value = value;
        query.disabled = false;
      }
      for (const [name, value] of Object.entries(override.headers ?? {})) {
        const headers = (request.header ??= []);
        const existing = headers.find((h) => h.key.toLowerCase() === name.toLowerCase());
        if (existing) existing.value = value;
        else headers.push({ key: name, value });
      }
      request.description = { content: describe(spec, info, names, guards), type: "text/markdown" };
      const scripts = override.scripts ?? [];
      item.event = [
        ...toEvents(preRequestScript(info, names, guards), scripts, "beforeRequest"),
        ...toEvents(testScript(spec, info), scripts, "afterResponse"),
      ];
      return { item, index, rank: requestRank(info) };
    });
    folder.item = ranked.sort((a, b) => a.rank - b.rank || a.index - b.index).map((r) => r.item);
    folder.description = `Requests for **${folder.name}**, in dependency order (creates and lists first, deletes last). Each request documents what it needs and what it sets.`;
  }
  if (pending.size) {
    throw new Error(`overrides for operations that no longer exist (${path.relative(ROOT, OVERRIDES)}):\n  ${[...pending].join("\n  ")}`);
  }
  const order = orderFolders(renamed.item.map((f) => f.name), folderNeeds, folderSets);
  renamed.item.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  renamed.event = toEvents(COLLECTION_PRE_REQUEST.split("\n"), overrides.collection?.scripts ?? [], "beforeRequest");
  renamed.info.description = [
    spec.info.description ?? "",
    "",
    "Generated from the API's OpenAPI document by `make api-sync`; GitHub is the source of truth.",
    "Start with **Sign in**, pick the `local`, `dev` or `prod` environment, and see the workspace documents.",
  ].join("\n");

  const entries = renamed.item.flatMap((folder) =>
    (folder.item ?? []).map((item) => ({ folder: folder.name, name: item.name, info: operations.get(requestKey(item.request)), guard: overrides.requests?.[requestKey(item.request)]?.guard })),
  );
  return { collection: renamed, analysis, entries };
}

// ── Files ───────────────────────────────────────────────────────────────────

function stableUuid(name) {
  const bytes = createHash("sha1").update(`remote-ai-platform/postman/${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5 (name-based)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/"))
    .sort();
}

function stabiliseIds(dir, prefix) {
  // The migrator assigns random UUIDs and hand-written files have none; derive
  // every id from the file's path so regeneration is byte-identical and a
  // Postman workspace keeps each item's identity across pushes.
  for (const file of listFiles(dir).filter((f) => f.endsWith(".yaml"))) {
    const full = path.join(dir, file);
    const text = fs.readFileSync(full, "utf8");
    const id = `id: ${stableUuid(`${prefix}/${file}`)}`;
    fs.writeFileSync(full, /^id: .*$/m.test(text) ? text.replace(/^id: .*$/m, id) : text.replace(/^(\$kind: .*)$/m, `$1\n${id}`));
  }
}

function overlayFolders() {
  if (!fs.existsSync(OVERRIDES_DIR)) return [];
  return fs
    .readdirSync(OVERRIDES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function postman(args, options = {}) {
  return execFileSync(CLI, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options });
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ── Validation ──────────────────────────────────────────────────────────────

function coverageErrors(spec, dir) {
  const expected = new Map();
  for (const [urlPath, item] of Object.entries(spec.paths)) {
    for (const method of METHODS.filter((m) => item[m])) {
      const operation = item[method];
      const parameters = [...(item.parameters ?? []), ...(operation.parameters ?? [])];
      const names = (where) => parameters.filter((p) => p.in === where).map((p) => p.name).sort();
      expected.set(operationKey(method, urlPath), {
        query: names("query"),
        path: names("path"),
        headers: names("header"),
        body: Boolean(operation.requestBody),
        auth: (operation.security ?? spec.security ?? []).length > 0,
      });
    }
  }

  const errors = [];
  const seen = new Set();
  const handWritten = overlayFolders().map((folder) => `${folder}/`);
  for (const file of listFiles(dir).filter((f) => f.endsWith(".request.yaml") && !handWritten.some((h) => f.startsWith(h)))) {
    const request = YAML.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    if (!request.url.startsWith("{{base_url}}/")) errors.push(`${file}: url does not start with {{base_url}}`);
    const urlPath = request.url.replace("{{base_url}}", "").split("?")[0].replace(/:(\w+)/g, "{$1}");
    const key = operationKey(request.method, urlPath);
    const want = expected.get(key);
    if (!want) {
      errors.push(`${file}: ${key} is not an operation in docs/api/openapi.yaml (stale request)`);
      continue;
    }
    seen.add(key);
    // v3 writes key/value lists as either [{key, value}] or a {key: value} map.
    const keys = (list) => [...new Set(Array.isArray(list) ? list.map((p) => p.key) : Object.keys(list ?? {}))].sort();
    const headerKeys = keys(request.headers);
    const check = (label, actual, wanted) => {
      if (JSON.stringify(actual) !== JSON.stringify(wanted)) errors.push(`${key}: ${label} ${JSON.stringify(actual)} != OpenAPI ${JSON.stringify(wanted)}`);
    };
    check("query params", keys(request.queryParams), [...new Set(want.query)].sort());
    check("path variables", keys(request.pathVariables), want.path);
    check("missing header params", want.headers.filter((h) => !headerKeys.includes(h)), []);
    check("has JSON/form body", Boolean(request.body && request.body.type !== "text"), want.body);
    const bearer = request.auth?.type === "bearer" && JSON.stringify(request.auth).includes("{{access_token}}");
    check("bearer auth", bearer, want.auth);
    const types = (request.scripts ?? []).map((s) => s.type);
    check("has generated tests", types.includes("afterResponse"), true);
    check("has documentation", Boolean(request.description), true);
  }
  for (const key of expected.keys()) if (!seen.has(key)) errors.push(`${key}: in OpenAPI but missing from the collection`);
  return errors;
}

function environmentErrors(tree) {
  // Every committed environment must work on a fresh clone: together with the
  // globals and collection variables it declares every variable the
  // collection uses, and it never carries a secret value.
  const used = new Set();
  for (const file of listFiles(path.join(tree, "collections"))) {
    for (const match of fs.readFileSync(path.join(tree, "collections", file), "utf8").matchAll(/{{([A-Za-z_][\w-]*)}}/g)) used.add(match[1]);
  }
  const globals = new Set((YAML.parse(fs.readFileSync(path.join(tree, "globals/workspace.globals.yaml"), "utf8")).values ?? []).map((v) => v.key));
  globals.add("base_url"); // collection variable
  const errors = [];
  const files = listFiles(ENVIRONMENTS).filter((f) => f.endsWith(".environment.yaml"));
  if (JSON.stringify(files) !== JSON.stringify(["dev.environment.yaml", "local.environment.yaml", "prod.environment.yaml"])) {
    errors.push(`postman/environments must hold exactly local, dev and prod (found: ${files.join(", ")})`);
  }
  for (const file of files) {
    const values = YAML.parse(fs.readFileSync(path.join(ENVIRONMENTS, file), "utf8")).values ?? [];
    const keys = new Set(values.map((v) => v.key));
    for (const name of [...used].sort()) if (!keys.has(name) && !globals.has(name)) errors.push(`${file}: missing variable "${name}" used by the collection`);
    for (const v of values) if (v.type === "secret" && v.value) errors.push(`${file}: secret "${v.key}" must be committed empty`);
  }
  return errors;
}

function validate(spec, tree, collectionDir) {
  postman(["collection", "lint", collectionDir, "--fail-severity", "error"]);
  postman(["environment", "lint", ENVIRONMENTS]);
  const errors = [...coverageErrors(spec, collectionDir), ...environmentErrors(tree)];
  if (errors.length) throw new Error(`generated Postman workspace is invalid:\n  ${errors.join("\n  ")}`);
}

// ── Build ───────────────────────────────────────────────────────────────────

/** Paths under postman/ this generator owns, relative to postman/. */
function generatedPaths(title) {
  return [`collections/${title}`, "globals/workspace.globals.yaml", `specs/${slug(title)}.yaml`, `mocks/${slug(title)}`, "documents", "flows"];
}

async function build(tree) {
  const specText = fs.readFileSync(OPENAPI, "utf8");
  const spec = YAML.parse(specText);
  const title = spec.info.title;
  const overrides = fs.existsSync(OVERRIDES) ? (YAML.parse(fs.readFileSync(OVERRIDES, "utf8")) ?? {}) : {};

  const { collection, analysis, entries } = enrich(await convert(installSeededFaker(), specText), spec, overrides);

  const collectionDir = path.join(tree, "collections", title);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "postman-sync-"));
  try {
    const v21 = path.join(work, "collection.v2.1.json");
    fs.writeFileSync(v21, JSON.stringify(collection, null, 2));
    postman(["collection", "migrate", v21, "--output", collectionDir]);

    // Mock server from the same OpenAPI document (postman mock run postman/mocks/<slug>/config.yaml).
    const mockDir = path.join(tree, "mocks", slug(title));
    postman(["mock", "generate", OPENAPI, "--output", mockDir, "--port", String(MOCK_PORT), "--force"]);
    const config = path.join(mockDir, "config.yaml");
    // Stable ids for the mock and each scenario (a push would otherwise add random ones).
    const mock = YAML.parse(fs.readFileSync(config, "utf8"));
    mock.id = stableUuid(`mocks/${slug(title)}`);
    for (const scenario of mock.scenarios ?? []) scenario.id = stableUuid(`mocks/${slug(title)}/scenarios/${scenario.name}`);
    fs.writeFileSync(config, YAML.stringify(mock));
    for (const file of listFiles(mockDir).filter((f) => f.endsWith(".js"))) {
      const full = path.join(mockDir, file);
      // Generated timestamps are "now"-relative; pin them so regeneration is stable.
      fs.writeFileSync(full, fs.readFileSync(full, "utf8").replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, "2026-01-01T00:00:00.000Z"));
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  for (const folder of overlayFolders()) {
    if (fs.existsSync(path.join(collectionDir, folder))) throw new Error(`overrides folder "${folder}" clashes with a generated folder`);
    fs.cpSync(path.join(OVERRIDES_DIR, folder), path.join(collectionDir, folder), { recursive: true });
  }
  stabiliseIds(collectionDir, `collections/${title}`);

  // Flows: steps resolve to request files by repository path.
  const byKey = new Map();
  for (const file of listFiles(collectionDir).filter((f) => f.endsWith(".request.yaml"))) {
    const request = YAML.parse(fs.readFileSync(path.join(collectionDir, file), "utf8"));
    const info = {
      path: `postman/collections/${title}/${file}`,
      name: request.name ?? path.basename(file, ".request.yaml"),
      method: request.method,
    };
    byKey.set(file.replace(/\.request\.yaml$/, ""), info);
    if (request.url?.startsWith("{{base_url}}")) {
      byKey.set(operationKey(request.method, request.url.replace("{{base_url}}", "").split("?")[0].replace(/:(\w+)/g, "{$1}")), info);
    }
  }
  fs.mkdirSync(path.join(tree, "flows"), { recursive: true });
  const flowDefinitions = fs.existsSync(FLOWS) ? YAML.parse(fs.readFileSync(FLOWS, "utf8")) : {};
  for (const [name, text] of Object.entries(buildFlows(flowDefinitions, (step) => byKey.get(step) ?? null))) {
    fs.writeFileSync(path.join(tree, "flows", name), text);
  }

  // The OpenAPI document as a Postman spec (Spec Hub reads postman/specs/).
  // Named after the API: Postman shows a single-file spec by its file name.
  fs.mkdirSync(path.join(tree, "specs"), { recursive: true });
  fs.writeFileSync(path.join(tree, "specs", `${slug(title)}.yaml`), specText);

  // Workspace globals: every id variable a request needs or captures, so each
  // is declared (empty) in every environment.
  const captured = [...new Set([...analysis.producers.keys(), ...[...analysis.operations.values()].flatMap((o) => o.needs)])].sort();
  fs.mkdirSync(path.join(tree, "globals"), { recursive: true });
  fs.writeFileSync(
    path.join(tree, "globals/workspace.globals.yaml"),
    YAML.stringify({ name: "Globals", values: captured.map((key) => ({ key, value: "", enabled: true, type: "default" })) }),
  );

  fs.mkdirSync(path.join(tree, "documents"), { recursive: true });
  for (const [name, text] of Object.entries(buildDocuments({ spec, analysis, entries, title, mockPort: MOCK_PORT }))) {
    fs.writeFileSync(path.join(tree, "documents", name), text);
  }

  validate(spec, tree, collectionDir);
  return title;
}

function treeDiff(a, b) {
  const left = new Set(listFiles(a));
  const right = new Set(listFiles(b));
  const changes = [];
  for (const f of right) if (!left.has(f)) changes.push(`+ ${f}`);
  for (const f of left) if (!right.has(f)) changes.push(`- ${f}`);
  for (const f of left) {
    if (right.has(f) && fs.readFileSync(path.join(a, f), "utf8") !== fs.readFileSync(path.join(b, f), "utf8")) changes.push(`~ ${f}`);
  }
  return changes.sort((x, y) => x.slice(2).localeCompare(y.slice(2)));
}

function diffPath(relative, tree) {
  const committed = path.join(POSTMAN, relative);
  const built = path.join(tree, relative);
  if (fs.existsSync(built) && fs.statSync(built).isFile()) {
    const same = fs.existsSync(committed) && fs.readFileSync(committed, "utf8") === fs.readFileSync(built, "utf8");
    return same ? [] : [`~ ${relative}`];
  }
  return treeDiff(committed, built).map((c) => `${c.slice(0, 2)}${relative}/${c.slice(2)}`);
}

async function main() {
  const check = process.argv.includes("--check");
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "postman-workspace-"));
  try {
    const title = await build(staging);
    const changes = generatedPaths(title).flatMap((relative) => diffPath(relative, staging));

    if (check) {
      if (changes.length) {
        console.log("API documentation drift detected.\n");
        console.log(`Generated Postman files are out of date (${changes.length} file(s) differ under postman/):`);
        for (const change of changes.slice(0, 20)) console.log(`  ${change}`);
        if (changes.length > 20) console.log(`  ... and ${changes.length - 20} more`);
        console.log("\nRun:\n\n  make api-sync\n");
        process.exitCode = 1;
      } else {
        console.log("Postman workspace files are up to date and valid (lint + OpenAPI coverage + environments).");
      }
      return;
    }

    for (const relative of generatedPaths(title)) {
      const target = path.join(POSTMAN, relative);
      fs.rmSync(target, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(path.join(staging, relative), target, { recursive: true });
    }
    console.log(`${changes.length ? `updated (${changes.length} file(s))` : "unchanged"}: postman/ (generated parts)`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`postman sync failed: ${error.stderr || error.message}`);
  process.exit(1);
});
