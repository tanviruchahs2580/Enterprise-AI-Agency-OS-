import { newToken } from "@agency/core";
import type { CompletionRequest, ModelDescriptor, ModelProvider, ProviderInfo } from "./types.ts";

/**
 * Deterministic mock provider for tests and offline development.
 * Never calls the network; echoes structured output so routers/workflows can
 * be tested end-to-end without paid APIs (master prompt §88/§89).
 */
export class MockModelProvider implements ModelProvider {
  readonly info: ProviderInfo;
  readonly models: ModelDescriptor[];
  private failNext = 0;
  private latencyMs: number;
  public callCount = 0;
  public lastPrompt = "";

  constructor(opts?: { models?: ModelDescriptor[]; latencyMs?: number }) {
    this.latencyMs = opts?.latencyMs ?? 0;
    this.info = {
      id: "mock",
      name: "Mock Provider",
      kind: "mock",
      baseUrl: "internal://mock",
      priority: 1000,
    };
    this.models =
      opts?.models ?? [
        {
          id: "mock-fast",
          alias: "mock-fast",
          modelId: "mock-fast",
          tier: "FAST",
          capabilities: ["chat", "json"],
          contextWindow: 32_000,
          inputCostPer1k: 0.0001,
          outputCostPer1k: 0.0002,
        },
        {
          id: "mock-reasoning",
          alias: "mock-reasoning",
          modelId: "mock-reasoning",
          tier: "REASONING",
          capabilities: ["chat", "tools", "code", "json"],
          contextWindow: 200_000,
          inputCostPer1k: 0.001,
          outputCostPer1k: 0.002,
        },
      ];
  }

  /** Test hook: make the next N complete() calls throw. */
  failNextCalls(n: number): void {
    this.failNext = n;
  }

  async complete(
    modelId: string,
    req: CompletionRequest
  ): Promise<{ content: string; usage: { tokensIn: number; tokensOut: number } }> {
    this.callCount++;
    this.lastPrompt = req.messages.map((m) => m.content).join("\n");
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("mock_provider_failure");
    }
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
    const content = `[${modelId}] ack:${newToken(6)}`;
    return {
      content,
      usage: {
        tokensIn: Math.ceil(this.lastPrompt.length / 4),
        tokensOut: Math.ceil(content.length / 4),
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.failNext === 0;
  }
}
