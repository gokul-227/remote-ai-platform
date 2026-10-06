// Postman Flows (postman/flows/*.flow) from postman/overrides/flows.yaml.
//
// Written in the format Postman's Local Mode saves: HTTP request blocks point
// at request files by repository path (not cloud ids), so a flow works in any
// clone. Blocks run in order, each starting when the previous one succeeds;
// ids and tokens travel through the environment, as in a collection run.

import { createHash } from "node:crypto";

const ENVIRONMENT = "postman/environments/local.environment.yaml";
const ROW = 5; // blocks per row on the canvas

function shortId(...parts) {
  // Flow node ids are 8 URL-safe characters; derive them so output is stable.
  return createHash("sha256").update(parts.join("/")).digest("base64url").slice(0, 8);
}

function stableUuid(name) {
  const bytes = createHash("sha1").update(`remote-ai-platform/flows/${name}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * @param definitions parsed flows.yaml
 * @param resolve step ("METHOD /path" or "Folder/Request") -> {path, name, method} or null
 * @returns {fileName: json text}
 */
export function buildFlows(definitions, resolve) {
  const files = {};
  for (const definition of definitions.flows ?? []) {
    const name = definition.name;
    const nodes = {};
    const connections = {};
    const input = shortId(name, "io");
    const inputKey = shortId(name, "input");
    const start = shortId(name, "start");
    nodes[start] = {
      type: "ev/endpoint@3",
      pos: { x: 0, y: 0 },
      config: {
        inputs: [{ id: inputKey, type: "value/reference@2", kind: "reference", value: "", key: "Start", __noIn: true }],
        data: "",
        language: "json",
        allowAnyType: false,
        inputs__expanded: true,
      },
      ui: { data: { triggerType: "ev/endpoint@3" }, namedInputsExpanded: true },
    };
    connections[shortId(name, "io-start")] = { source: input, sourcePort: "@", target: start, targetPort: `inputs|${inputKey}` };

    let previous = null;
    definition.steps.forEach((entry, index) => {
      const step = typeof entry === "string" ? entry : entry.step;
      const request = resolve(step);
      if (!request) throw new Error(`flow "${name}": step "${step}" is not a request in the collection`);
      const id = shortId(name, "step", String(index), step);
      const requestVariables = Object.entries(entry.variables ?? {}).map(([key, value]) => ({
        id: shortId(name, String(index), key),
        type: "TYPE_STRING",
        kind: "string",
        value: String(value),
        key,
      }));
      nodes[id] = {
        type: "task/http-request@1",
        pos: { x: 360 + (index % ROW) * 360, y: Math.floor(index / ROW) * 280 },
        config: {
          element: { name: request.name, method: request.method, path: request.path },
          environment: ENVIRONMENT,
          parseBody: "auto",
          requestVariables,
          scriptsModifyEnvVars: true,
          trackGlobalEnvironment: true,
          requestVariables__expanded: true,
        },
        ui: { data: {}, namedInputsExpanded: true },
      };
      connections[shortId(name, "link", String(index))] = previous
        ? { source: previous, target: id, sourcePort: "success", targetPort: "AI" }
        : { source: start, target: id, sourcePort: `output|${inputKey}`, targetPort: "AI" };
      previous = id;
    });

    const flow = {
      version: 1,
      name,
      description: definition.description ?? "",
      flow: {
        description: definition.description ?? "",
        nodes,
        connections,
        annotations: {},
        groups: {},
        webhook: { payloadContent: "body-only", responseType: "default" },
        forms: {},
        modules: {},
        io: { [input]: { type: "input", name: "Start", typeDef: { type: "string" } } },
        ports: {},
        meta: {},
        scenes: {},
        scenarios: {},
        config: { definitions: {}, constants: {} },
      },
      lockbox: {},
      info: { _postman_id: stableUuid(name) },
    };
    files[`${name}.flow`] = `${JSON.stringify(flow, null, 2)}\n`;
  }
  return files;
}
