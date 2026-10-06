// Prepare a copy of postman/ for `postman workspace push`.
//
// The repository's ids are owner-neutral (derived from file paths). A cloud
// collection identifies items by owner-prefixed ids it assigned itself, and a
// new item must name its parent by that cloud id. So, in a staged copy only:
// items that already exist in the cloud collection (matched by folder and
// name) take their cloud id; new ones get "<ownerId>-<uuid>".
//
//   node tools/api_docs/stage_publish.mjs <staged-dir> <owner-id> [cloud-collection-uid]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/.bin/postman");
const [staged, owner, cloudCollection] = process.argv.slice(2);
if (!staged || !owner) throw new Error("usage: stage_publish.mjs <staged-dir> <owner-id> [cloud-collection-uid]");

function cloudIds(uid) {
  const ids = new Map();
  if (!uid) return ids;
  const collection = JSON.parse(execFileSync(CLI, ["collection", "get", uid, "--json"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
  ids.set("", collection.id);
  const walk = (items, folder) => {
    for (const item of items ?? []) {
      if (item.items) {
        const key = folder ? `${folder}/${item.name}` : item.name;
        ids.set(`F:${key}`, item.id);
        walk(item.items, key);
      } else {
        ids.set(`R:${folder}/${item.name}`, item.id);
        for (const example of item.examples ?? []) ids.set(`E:${folder}/${item.name}/${example.name}`, example.id);
      }
    }
  };
  walk(collection.items, "");
  return ids;
}

function files(dir) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".yaml"))
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
}

const nameOf = (full, fallback) => YAML.parse(fs.readFileSync(full, "utf8"))?.name ?? fallback;

for (const title of fs.readdirSync(path.join(staged, "postman/collections"))) {
  const root = path.join(staged, "postman/collections", title);
  if (!fs.statSync(root).isDirectory()) continue;
  const ids = cloudIds(cloudCollection);
  const folderName = (relDir) =>
    relDir
      .split("/")
      .filter(Boolean)
      .map((_, i, parts) => {
        const def = path.join(root, ...parts.slice(0, i + 1), ".resources/definition.yaml");
        return fs.existsSync(def) ? nameOf(def, parts[i]) : parts[i];
      })
      .join("/");

  let reused = 0;
  let created = 0;
  for (const rel of files(root)) {
    const full = path.join(root, rel);
    let key;
    if (rel === ".resources/definition.yaml") {
      key = "";
    } else if (rel.endsWith("/.resources/definition.yaml")) {
      key = `F:${folderName(rel.slice(0, -"/.resources/definition.yaml".length))}`;
    } else if (rel.endsWith(".request.yaml")) {
      const dir = path.posix.dirname(rel);
      key = `R:${folderName(dir === "." ? "" : dir)}/${nameOf(full, path.basename(rel, ".request.yaml"))}`;
    } else if (rel.endsWith(".example.yaml")) {
      const match = rel.match(/^(?:(.*)\/)?\.resources\/(.+)\.resources\/examples\/(.+)\.example\.yaml$/);
      if (!match) continue;
      const [, dir = "", requestStem] = match;
      const requestFile = path.join(root, dir, `${requestStem}.request.yaml`);
      const requestName = fs.existsSync(requestFile) ? nameOf(requestFile, requestStem) : requestStem;
      key = `E:${folderName(dir)}/${requestName}/${nameOf(full, match[3])}`;
    } else {
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    const local = text.match(/^id: (.*)$/m)?.[1];
    if (!local) continue;
    const bare = local.startsWith(`${owner}-`) ? local.slice(owner.length + 1) : local;
    // New items need "<owner>-<uuid>", and the cloud only accepts version-4
    // shaped UUIDs (ours are name-based v5): keep the bits, set the version.
    const v4 = `${bare.slice(0, 14)}4${bare.slice(15)}`;
    const id = ids.get(key) ?? `${owner}-${v4}`;
    if (ids.has(key)) reused += 1;
    else created += 1;
    fs.writeFileSync(full, text.replace(/^id: .*$/m, `id: ${id}`));
  }
  console.log(`${title}: ${reused} item(s) matched in the cloud, ${created} new`);
}
