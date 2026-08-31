import { sha256Hex } from "@agency/core";

/** Claim keyword → required evidence type (master prompt §28: no completion
 *  claim without evidence). */
export const DEFAULT_CLAIM_EVIDENCE_TYPES: Record<string, string> = {
  "tests passed": "test-result",
  "tests-passed": "test-result",
  "build succeeded": "build-log",
  "build-succeeded": "build-log",
  "deploy completed": "deployment",
  "deploy-completed": "deployment",
  "migration succeeded": "migration",
  "migration-succeeded": "migration",
  "security passed": "security-scan",
  "security-passed": "security-scan",
  "benchmark recorded": "benchmark",
  "benchmark-recorded": "benchmark",
  "review approved": "review",
  "review-approved": "review",
};

export type EvidenceType = "test-result" | "build-log" | "deployment" | "migration" | "security-scan" | "benchmark" | "review" | "research" | "audit";

export interface EvidenceRecord {
  id?: string;
  orgId?: string;
  executionId?: string;
  type: string;
  source: string;
  /** The evidence payload. Stored in the clear only when not sensitive; the
   *  control plane may store a location instead and keep `contentHash` only. */
  content?: string;
  contentHash?: string;
  claims?: string[];
  createdAt?: string;
}

export interface EvidenceVerification {
  id: string;
  contentHash: string;
  inferredContent: boolean;
  intact: boolean;
  /** If content was supplied, recompute `contentHash` and compare. */
  recomputedHash?: string;
}

/**
 * Evidence registry primitives (master prompt §28: evidence-backed claims).
 * The control plane persists rows; this pure module owns hashing, tamper
 * detection and the completion-claim guard so they can be unit-tested without
 * a database.
 */
export function hashContent(content: string): string {
  return sha256Hex(content.trim());
}

/** Recompute the content hash over the stored content and compare it. */
export function verifyRecord(record: {
  id: string;
  content?: string;
  contentHash?: string;
}): EvidenceVerification {
  const inferredContent = record.contentHash === undefined && record.content !== undefined;
  if (record.content === undefined) {
    return {
      id: record.id,
      contentHash: record.contentHash ?? "",
      inferredContent: false,
      intact: record.contentHash === undefined ? false : true,
      recomputedHash: undefined,
    };
  }
  const recomputed = hashContent(record.content);
  const stored = record.contentHash ?? recomputed;
  return {
    id: record.id,
    contentHash: stored,
    inferredContent,
    intact: stored === recomputed,
    recomputedHash: recomputed,
  };
}

export interface CompletionClaim {
  claim: string;
}

/**
 * Guard used by skill runtime verification and handoff checks: every
 * completion claim must be backed by at least one evidence record whose type
 * matches. Returns the list of unbacked claims (empty = all backed).
 */
export function unbackedCompletionClaims(
  claims: string[],
  availableEvidenceTypes: string[],
  claimTypeMap: Record<string, string> = DEFAULT_CLAIM_EVIDENCE_TYPES
): string[] {
  const available = new Set(availableEvidenceTypes);
  const missing: string[] = [];
  for (const claim of claims) {
    const requiredType = claimTypeMap[claim];
    if (!requiredType) continue; // unknown claim → not gated by this guard
    if (!available.has(requiredType)) missing.push(claim);
  }
  return missing;
}

export function summarize(records: EvidenceRecord[]): {
  count: number;
  byType: Record<string, number>;
  bySource: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const r of records) {
    byType[r.type] = (byType[r.type] ?? 0) + 1;
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }
  return { count: records.length, byType, bySource };
}