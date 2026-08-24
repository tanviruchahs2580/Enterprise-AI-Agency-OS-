export type ModelTier =
  | "FAST"
  | "STANDARD"
  | "REASONING"
  | "REVIEW"
  | "SECURITY"
  | "VISION"
  | "LOCAL";

export type ModelCapability = "chat" | "tools" | "vision" | "json" | "long_context" | "code";

export interface ModelDescriptor {
  id: string;
  alias: string;          // logical name, e.g. "ox-alpha", "haiku-class"
  modelId: string;        // provider-side id
  tier: ModelTier;
  capabilities: ModelCapability[];
  contextWindow: number;
  inputCostPer1k: number; // USD
  outputCostPer1k: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  kind: "mock" | "openai_compatible";
  baseUrl: string;
  priority: number;
}

export interface CompletionRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface CompletionUsage {
  tokensIn: number;
  tokensOut: number;
}

export interface CompletionResult {
  content: string;
  usage: CompletionUsage;
  latencyMs: number;
  modelUsed: string;      // concrete model that answered
  fallbackCount: number;
  retryCount: number;
  estimatedCostUsd: number;
}

/** Every provider must implement this minimal surface. */
export interface ModelProvider {
  readonly info: ProviderInfo;
  readonly models: ModelDescriptor[];
  complete(modelId: string, req: CompletionRequest): Promise<{ content: string; usage: CompletionUsage }>;
  healthCheck(): Promise<boolean>;
}

// ---------- routing policy ----------

export interface RoutingConstraints {
  tier?: ModelTier;
  requiredCapabilities?: ModelCapability[];
  privacyLocalOnly?: boolean;
  maxLatencyMs?: number;
}

export interface RoutingPolicy {
  /** Ordered candidate selection strategy */
  preferCheaper: boolean;
  maxFallbacks: number;
  requestTimeoutMs: number;
  retry: { maxRetries: number; baseDelayMs: number };
}

export const defaultPolicy: RoutingPolicy = {
  preferCheaper: true,
  maxFallbacks: 3,
  requestTimeoutMs: 120_000,
  retry: { maxRetries: 2, baseDelayMs: 400 },
};

// ---------- cost accounting ----------

export function estimateTokens(text: string): number {
  // ~4 chars/token heuristic (documented in MODEL-ROUTING.md)
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateCost(m: ModelDescriptor, usage: CompletionUsage): number {
  return (
    (usage.tokensIn / 1000) * m.inputCostPer1k +
    (usage.tokensOut / 1000) * m.outputCostPer1k
  );
}

/** Larger windows for the overflow guard's per-model check. */
export interface ContextWindowCheck {
  modelId: string;
  contextWindow: number;
}
