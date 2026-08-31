export type HandoffIntent =
  | "decomposition"
  | "implementation"
  | "review"
  | "escalation"
  | "merge"
  | "release";

export interface AgentHandoff {
  id?: string;
  orgId?: string;
  missionId?: string;
  executionId?: string;
  sender: string;
  receiver: string;
  intent: HandoffIntent;
  /** The work product being passed (JSON-serializable). */
  payload: Record<string, unknown>;
  /** Evidence record ids backing the handoff (must exist for high confidence). */
  evidence: string[];
  /** 0..1 — how sure the sender is. Drives review depth (verificationPolicyFor). */
  confidence: number;
  /** Facts vs assumptions separation → explicit fields, not prose. */
  assumptions: string[];
  /** What the receiver must resolve before the next handoff step. */
  unresolvedQuestions: string[];
  createdAt?: string;
}

/**
 * Typed handoff validator (master prompt §13 handoff contract: what was
 * requested → produced → remains → tests → risks). Returns a list of schema
 * violations; an empty list means the handoff is a valid contract.
 */
export function validateHandoff(h: Partial<AgentHandoff>): string[] {
  const errors: string[] = [];
  if (typeof h.sender !== "string" || h.sender.length === 0) errors.push("sender: required");
  if (typeof h.receiver !== "string" || h.receiver.length === 0) errors.push("receiver: required");
  const INTENTS: HandoffIntent[] = ["decomposition", "implementation", "review", "escalation", "merge", "release"];
  if (!INTENTS.includes(h.intent as HandoffIntent)) {
    errors.push("intent: must be one of decomposition|implementation|review|escalation|merge|release");
  }
  if (!h.payload || typeof h.payload !== "object" || Array.isArray(h.payload)) {
    errors.push("payload: JSON object required");
  }
  if (h.confidence === undefined) errors.push("confidence: required");
  else if (!(h.confidence >= 0 && h.confidence <= 1)) errors.push("confidence: must be between 0 and 1");
  if (!Array.isArray(h.evidence)) errors.push("evidence: array required");
  if (!Array.isArray(h.assumptions)) errors.push("assumptions: array required");
  if (!Array.isArray(h.unresolvedQuestions)) errors.push("unresolvedQuestions: array required");
  return errors;
}

export type VerificationPolicy = "standard" | "review" | "escalate";

/**
 * Confidence drives verification depth (master prompt §11/§13):
 *   ≥0.9 standard pass-thru; 0.6–0.9 requires review; below 0.6 should escalate
 *   to the principal for a decision. Thresholds are configurable.
 */
export function verificationPolicyFor(
  confidence: number,
  thresholds?: { reviewBelow?: number; escalateBelow?: number }
): VerificationPolicy {
  const escalateBelow = thresholds?.escalateBelow ?? 0.6;
  const reviewBelow = thresholds?.reviewBelow ?? 0.9;
  if (confidence < escalateBelow) return "escalate";
  if (confidence < reviewBelow) return "review";
  return "standard";
}

export const DEFAULT_VERIFICATION_THRESHOLDS = { reviewBelow: 0.9, escalateBelow: 0.6 };