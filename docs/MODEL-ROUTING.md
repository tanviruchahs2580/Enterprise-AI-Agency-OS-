# MODEL ROUTING

## Concepts

| Concept | Meaning |
|---|---|
| Provider | Any endpoint implementing the `ModelProvider` contract (mock, OpenAI-compatible) |
| Model | Concrete model with tier, capabilities, context window, per-1k costs |
| Tier | FAST · STANDARD · REASONING · REVIEW · SECURITY · VISION · LOCAL |
| Routing policy | preferCheaper, maxFallbacks, timeout, retry/backoff |
| Budget guard | pre-flight estimate + post-hoc spend recording |

## How a request flows

```
complete(prompt, constraints{tier, capabilities…})
  1. select candidates: provider healthy ∧ tier match ∧ capability superset
     → sort cheaper-first
  2. budget guard: estimate = tokens(prompt)/4 × output cost
       blocked → BUDGET_EXCEEDED before any network call
  3. for each candidate (up to maxFallbacks+1):
       circuit breaker.acquire
         retry loop (maxRetries, exp backoff 400ms×2ⁿ)
           timeout wrapper (requestTimeoutMs)
           success → breaker.ok, record, return
       failure → breaker.fail → next candidate, fallbackCount++
  4. all failed → PROVIDER_FAILURE with requestId + attempts
```

**Fallbacks are never silent**: every attempt lands in `model_requests` with
`requested_model`, `selected_model`, `fallback_reason`, latency, tokens and cost.

## Providers

### Mock (always available)

Deterministic, offline. Powers CI and local development. Two models:
`mock-fast` (FAST) and `mock-reasoning` (REASONING).

### OpenAI-compatible

Enable via env:

```
MODEL_PROVIDER_API_KEY=…
MODEL_PROVIDER_BASE_URL=https://api.example.com/v1   # Ollama: http://127.0.0.1:11434/v1
MODEL_PROVIDER_MODEL=ox-alpha
```

Works with any `/chat/completions` implementation: Ox Alpha gateway, OpenAI,
vLLM, LiteLLM, Ollama.

### Adding a custom provider

Implement:

```ts
interface ModelProvider {
  info: ProviderInfo; models: ModelDescriptor[];
  complete(modelId, req): Promise<{content, usage}>;
  healthCheck(): Promise<boolean>;
}
```

and register it on the router in `apps/control-plane/src/context.ts`.

## Circuit breaker

Per `provider:model`. CLOSED →(5 failures)→ OPEN (rejects fast, fallback used)
→(30s cooldown)→ HALF_OPEN → probe success closes / failure re-opens.

## Cost accounting

Every successful call writes cost events at org/daily/monthly scopes (+task/
project when context known). Budget scopes evaluated first-violation-wins:
request → task → mission → project → org → daily → monthly.
Actions: `block` (default), `downgrade` (route to cheaper tier — v0.2),
`approve_required`.

Token estimation heuristic: ~4 chars/token (documented approximation; providers
reporting real usage always win).
