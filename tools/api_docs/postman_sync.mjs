// Sync the API's OpenAPI document into ONE Postman cloud collection.
// Nothing Postman-related is kept in the repository: the collection lives only
// in the Postman workspace and is rebuilt from the code on every run.
//
//   node tools/api_docs/postman_sync.mjs <openapi.yaml> [--dry-run]
//
// Converts with Postman's own converter (openapi-to-postmanv2), then through the
// Postman API (https://api.getpostman.com):
//   POSTMAN_COLLECTION_ID set  -> update that collection (if it was deleted,
//                                 fall back to the workspace below)
//   else POSTMAN_WORKSPACE_ID  -> update the collection named like the API in
//                                 that workspace, or create it once (first run)
// The converted collection's hash is stored as the collection variable
// `openapi_sha256`; when it matches, nothing is sent (no-op runs are free).
//
// Env: POSTMAN_API_KEY (secret), POSTMAN_COLLECTION_ID / POSTMAN_WORKSPACE_ID,
// optional POSTMAN_BASE_URL (the collection's {{baseUrl}}). Without an API key,
// or with --dry-run, it only converts and validates.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import YAML from "yaml";

const API = "https://api.getpostman.com";
const HASH_VAR = "openapi_sha256";
const FIXED_TIME = Date.UTC(2026, 0, 1);

// The converter fakes example bodies with json-schema-faker, which draws from
// Math.random and the clock. Reseed per schema (from the schema's own content)
// and freeze the clock, so the collection -- and its hash -- depend only on the
// spec, and an unchanged API is never re-sent.
function loadSeededConverter() {
  const require = createRequire(import.meta.url);
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
  // The faker captured Math.random as its `random` option at load time.
  faker.option({ random: () => Math.random() });
  require.cache[fakerPath].exports = seeded;
  return require("openapi-to-postmanv2");
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

// Item/response ids are random per conversion; Postman assigns its own.
function stripIds(value) {
  if (Array.isArray(value)) return value.map(stripIds);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "id" && key !== "_postman_id")
        .map(([key, v]) => [key, stripIds(v)]),
    );
  }
  return value;
}

export async function buildCollection(specText, baseUrl) {
  const spec = YAML.parse(specText);
  const result = await promisify(loadSeededConverter().convertV2)(
    { type: "json", data: spec },
    { folderStrategy: "Tags", parametersResolution: "Example", includeAuthInfoInExample: false },
  );
  if (!result.result) throw new Error(`OpenAPI conversion failed: ${result.reason}`);
  const collection = stripIds(result.output[0].data);
  collection.info.name = spec.info.title;
  let variables = (collection.variable || []).filter((v) => v.key !== HASH_VAR);
  if (baseUrl) variables = variables.map((v) => (v.key === "baseUrl" ? { ...v, value: baseUrl } : v));
  const hash = createHash("sha256").update(JSON.stringify({ ...collection, variable: variables })).digest("hex");
  collection.variable = [...variables, { key: HASH_VAR, value: hash, type: "string" }];
  return { collection, hash };
}

function countRequests(items) {
  return items.reduce((n, item) => n + (item.item ? countRequests(item.item) : 1), 0);
}

async function postman(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { "X-Api-Key": process.env.POSTMAN_API_KEY, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) {
    fail("Postman authentication failed. Check the POSTMAN_API_KEY secret (and that its user can edit the workspace).");
  }
  const text = await response.text();
  if (!response.ok) {
    return { ok: false, status: response.status, error: text.slice(0, 500) };
  }
  return { ok: true, status: response.status, data: JSON.parse(text) };
}

async function findCollection(workspaceId, name) {
  const res = await postman("GET", `/workspaces/${encodeURIComponent(workspaceId)}`);
  if (!res.ok) fail(`Could not read Postman workspace ${workspaceId} (HTTP ${res.status}): ${res.error}`);
  const matches = (res.data.workspace.collections || []).filter((c) => c.name === name);
  if (matches.length > 1) {
    fail(`Workspace ${workspaceId} has ${matches.length} collections named "${name}". Delete the extras or set POSTMAN_COLLECTION_ID.`);
  }
  return matches[0]?.uid;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const specPath = args.find((a) => a !== "--dry-run");
  if (!specPath) fail("Usage: postman_sync.mjs <openapi.yaml> [--dry-run]");

  let built;
  try {
    built = await buildCollection(readFileSync(specPath, "utf8"), process.env.POSTMAN_BASE_URL);
  } catch (error) {
    fail(`Failed to convert the OpenAPI specification: ${error.message}`);
  }
  const { collection, hash } = built;
  const name = collection.info.name;
  console.log(`Converted "${name}": ${countRequests(collection.item)} requests (openapi_sha256 ${hash.slice(0, 12)}).`);

  if (dryRun || !process.env.POSTMAN_API_KEY) {
    console.log(dryRun ? "Dry run: Postman was not contacted." : "POSTMAN_API_KEY is not set: Postman was not contacted.");
    return;
  }

  const workspaceId = process.env.POSTMAN_WORKSPACE_ID;
  if (!process.env.POSTMAN_COLLECTION_ID && !workspaceId) fail("Set the POSTMAN_WORKSPACE_ID (or POSTMAN_COLLECTION_ID) repository variable.");

  // A pinned collection that was deleted is not an error: fall back to the
  // workspace (find by name, or create), so nobody has to edit variables.
  let current;
  let uid = process.env.POSTMAN_COLLECTION_ID;
  if (uid) {
    current = await postman("GET", `/collections/${encodeURIComponent(uid)}`);
    if (!current.ok && current.status !== 404) {
      fail(`Postman collection ${uid} could not be read (HTTP ${current.status}): ${current.error}`);
    }
    if (!current.ok) {
      if (!workspaceId) fail(`Postman collection ${uid} no longer exists. Set POSTMAN_WORKSPACE_ID so it can be recreated.`);
      console.log(`Collection ${uid} no longer exists; using workspace ${workspaceId}.`);
      uid = undefined;
    }
  }
  if (!uid) {
    uid = await findCollection(workspaceId, name);
    if (uid) current = await postman("GET", `/collections/${encodeURIComponent(uid)}`);
  }

  if (!uid) {
    const res = await postman("POST", `/collections?workspace=${encodeURIComponent(workspaceId)}`, { collection });
    if (!res.ok) fail(`Postman collection synchronization failed: could not create it (HTTP ${res.status}): ${res.error}`);
    console.log(`✅ Created collection "${name}" (${res.data.collection.uid}) in workspace ${workspaceId}; later runs update it.`);
    return;
  }
  if (!current.ok) fail(`Postman collection ${uid} could not be read (HTTP ${current.status}): ${current.error}`);
  const stored = (current.data.collection.variable || []).find((v) => v.key === HASH_VAR)?.value;
  if (stored === hash) {
    console.log(`✅ Collection ${uid} is already up to date; nothing sent.`);
    return;
  }
  // Keep the cloud collection's identity; everything else is replaced.
  collection.info._postman_id = current.data.collection.info._postman_id;
  const res = await postman("PUT", `/collections/${encodeURIComponent(uid)}`, { collection });
  if (!res.ok) fail(`Postman collection synchronization failed (HTTP ${res.status}): ${res.error}`);
  console.log(`✅ Updated collection "${name}" (${uid}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
