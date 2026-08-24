import { AppError, newId, sleep } from "@agency/core";
import type { Clock } from "@agency/core";
import { CircuitBreaker } from "./breaker.ts";
import type {
  CompletionRequest,
  CompletionResult,
  ModelDescriptor,
  ModelProvider,
  RoutingConstraints,
  RoutingPolicy,
} from "./types.ts";
import { defaultPolicy, estimateCost, estimateTokens } from "./types.ts";

export interface RouterRecord {
  requestId: string;
  requestedModel: string | null;
  selectedModel: string;
  provider: string;
  fallbackReason: string | null;
  tier: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  retryCount: number;
  fallbackCount: number;
  status: "succeeded" | "failed" | "timeout" | "rate_limited" | "budget_blocked" | "cancelled";
  errorCode: string | null;
}

export interface BudgetGuard {
  /** Return true if spend is allowed; false to block. Called pre-flight. */
  allowSpend(estimatedUsd: number): boolean;
  recordSpend(amountUsd: number): void;
}

/** Selection candidate = concrete model + its provider + shared breaker map. */
interface Candidate {
  model: ModelDescriptor;
  provider: ModelProvider;
}

export interface RouterOptions {
  providers: ModelProvider[];
  policy?: Partial<RoutingPolicy>;
  budget?: BudgetGuard;
  clock?: Clock;
  onRecord?: (rec: RouterRecord) => void;
}

/**
 * Capability/tier-aware model router with retries, timeouts, circuit breakers,
 * explicit (never silent) fallback and cost accounting.
 */
export class ModelRouter {
  private policy: RoutingPolicy;
  private breakers = new Map<string, CircuitBreaker>();
  private health = new Map<string, boolean>();
  private opts: RouterOptions;

  constructor(opts: RouterOptions) {
    this.opts = opts;
    this.policy = { ...defaultPolicy, ...opts.policy };
    for (const p of opts.providers) this.health.set(p.info.id, true);
  }

  registerProvider(p: ModelProvider): void {
    if (!this.opts.providers.some((x) => x.info.id === p.info.id)) {
      this.opts.providers.push(p);
      this.health.set(p.info.id, true);
    }
  }

  allModels(): { provider: ModelProvider["info"]; model: ModelDescriptor }[] {
    return this.opts.providers.flatMap((p) =>
      p.models.map((m) => ({ provider: p.info, model: m }))
    );
  }

  /** Ordered candidates matching constraints. */
  select(constraints: RoutingConstraints): Candidate[] {
    const wantedTier = constraints.tier;
    const caps = new Set(constraints.requiredCapabilities ?? []);
    let cands: Candidate[] = [];
    for (const p of this.opts.providers) {
      if (this.health.get(p.info.id) === false) continue;
      for (const m of p.models) {
        if (wantedTier && m.tier !== wantedTier) continue;
        let capOk = true;
        for (const c of caps) {
          if (!m.capabilities.includes(c)) {
            capOk = false;
            break;
          }
        }
        if (!capOk) continue;
        cands.push({ model: m, provider: p });
      }
    }
    // exact tier first, then cheaper-first ordering
    cands.sort((a, b) => {
      const costA = a.model.inputCostPer1k + a.model.outputCostPer1k;
      const costB = b.model.inputCostPer1k + b.model.outputCostPer1k;
      return this.policy.preferCheaper ? costA - costB : costB - costA;
    });
    return cands;
  }

  async complete(
    req: CompletionRequest & { requestedModel?: string },
    constraints: RoutingConstraints = {}
  ): Promise<CompletionResult> {
    const requestId = newId("req");
    const traceId = newId("trc");
    const started = Date.now();
    const cands = this.select(constraints);
    if (cands.length === 0) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", "no healthy model matches routing constraints", {
        details: { constraints },
      });
    }
    const limited = cands.slice(0, this.policy.maxFallbacks + 1);

    // rough pre-flight budget estimate
    const estTokens =
      req.messages.reduce((n, m) => n + estimateTokens(m.content), 0) +
      (req.maxTokens ?? 1024);
    const estCost = limited[0]!.model.outputCostPer1k * (estTokens / 1000);
    if (this.opts.budget && !this.opts.budget.allowSpend(estCost)) {
      const rec = this.record(requestId, traceId, req.requestedModel, "-", "-", null,
        constraints.tier ?? "STANDARD", 0, 0, 0, 0, 0, "budget_blocked", "BUDGET_EXCEEDED", started);
      throw new AppError("BUDGET_EXCEEDED", "estimated cost exceeds available budget", {
        details: { estimatedUsd: estCost, requestId: rec.requestId },
      });
    }

    let fallbackCount = 0;
    let lastError: unknown;

    for (const cand of limited) {
      const breakerKey = `${cand.provider.info.id}:${cand.model.modelId}`;
      const breaker = this.breaker(breakerKey);
      try {
        breaker.acquire();
      } catch {
        fallbackCount++;
        lastError = new Error("circuit_open");
        continue;
      }

      for (let attempt = 0; attempt <= this.policy.retry.maxRetries; attempt++) {
        try {
          const result = await this.withTimeout(
            cand.provider.complete(cand.model.modelId, req),
            this.policy.requestTimeoutMs
          );
          breaker.onSuccess();
          const cost = estimateCost(cand.model, result.usage);
          this.opts.budget?.recordSpend(cost);
          const rec = this.record(
            requestId, traceId, req.requestedModel ?? cand.model.alias, cand.model.alias,
            cand.provider.info.name, fallbackCount > 0 ? `fallback_after_${fallbackCount}` : null,
            cand.model.tier, Date.now() - started,
            result.usage.tokensIn, result.usage.tokensOut, cost,
            attempt, fallbackCount, "succeeded", null, started
          );
          return {
            content: result.content,
            usage: result.usage,
            latencyMs: rec.latencyMs,
            modelUsed: cand.model.alias,
            fallbackCount,
            retryCount: attempt,
            estimatedCostUsd: cost,
          };
        } catch (e) {
          lastError = e;
          const err = e as Error & { code?: string };
          const nonRetryable =
            err instanceof AppError &&
            ["UNAUTHENTICATED", "VALIDATION_ERROR"].includes(err.code);
          if (nonRetryable || attempt === this.policy.retry.maxRetries) break;
          await sleep(this.policy.retry.baseDelayMs * 2 ** attempt);
        }
      }
      breaker.onFailure();
      fallbackCount++;
      // mark provider unhealthy after repeated hard failures handled by breaker state
    }

    const code =
      lastError instanceof AppError ? lastError.code : "PROVIDER_FAILURE";
    this.record(requestId, traceId, req.requestedModel ?? "-", "-", "-", "all_candidates_failed",
      constraints.tier ?? "STANDARD", Date.now() - started, 0, 0, 0, 0, fallbackCount,
      "failed", code, started);
    throw new AppError("PROVIDER_FAILURE", "all model candidates failed", {
      details: { requestId, attempts: fallbackCount },
      cause: lastError,
    });
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new AppError("TIMEOUT", "model call timed out")), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        }
      );
    });
  }

  private breaker(key: string): CircuitBreaker {
    let b = this.breakers.get(key);
    if (!b) {
      b = new CircuitBreaker();
      this.breakers.set(key, b);
    }
    return b;
  }

  private record(
    requestId: string,
    traceId: string,
    requestedModel: string | null,
    selectedModel: string,
    provider: string,
    fallbackReason: string | null,
    tier: string,
    latencyMs: number,
    tokensIn: number,
    tokensOut: number,
    costUsd: number,
    retryCount: number,
    fallbackCount: number,
    status: RouterRecord["status"],
    errorCode: string | null,
    _started: number
  ): RouterRecord {
    const rec: RouterRecord = {
      requestId, traceId, requestedModel, selectedModel, provider,
      fallbackReason, tier, latencyMs,
      tokensIn, tokensOut, estimatedCostUsd: costUsd,
      retryCount, fallbackCount, status, errorCode,
    };
    this.opts.onRecord?.(rec);
    return rec;
  }
}
