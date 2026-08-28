/**
 * Local result sink. The orchestrator integration persists results into the
 * database; this module provides a filesystem sink for CLI / standalone use
 * and is also handy for tests and debugging.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ScrapeJobResult } from "./types.ts";

export function writeResultsToFile(result: ScrapeJobResult, path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return path;
}

/** Convert a job result into a flat list of records for tabular sinks. */
export function toRecords(result: ScrapeJobResult): Record<string, unknown>[] {
  return result.pages.map((p) => ({
    url: p.url,
    status: p.status,
    rendered: p.rendered,
    piiFound: (p.piiFound ?? []).join(","),
    ...p.data,
    error: p.error ?? "",
  }));
}
