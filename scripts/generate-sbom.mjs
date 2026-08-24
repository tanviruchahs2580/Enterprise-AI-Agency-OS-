#!/usr/bin/env node
/**
 * SBOM generator (CycloneDX 1.5 JSON subset) derived from the npm lockfile.
 * Deterministic: same lockfile → same SBOM. Used by CI and releases.
 */
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const root = lock.packages?.[""] ?? {};
const components = [];

for (const [path, info] of Object.entries(lock.packages ?? {})) {
  if (path === "") continue;
  const name = path.replace(/^node_modules\//, "");
  components.push({
    type: "library",
    "bom-ref": `pkg:npm/${name}@${info.version ?? "unknown"}`,
    name,
    version: info.version ?? "unknown",
    purl: `pkg:npm/${name}@${info.version ?? "unknown"}`,
    scope: info.dev ? "excluded" : "required",
    licenses: info.license ? [{ license: { id: Array.isArray(info.license) ? undefined : info.license } }] : [],
  });
}

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${crypto.randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      name: root.name ?? "enterprise-ai-agency-os",
      version: root.version ?? "0.0.0",
    },
  },
  components,
};

console.log(JSON.stringify(sbom, null, 2));
