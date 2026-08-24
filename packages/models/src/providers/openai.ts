import { AppError } from "@agency/core";
import type { CompletionRequest, ModelDescriptor, ModelProvider, ProviderInfo } from "./types.ts";

/**
 * Provider for any OpenAI-compatible /chat/completions endpoint:
 * Ox Alpha gateways, OpenAI, vLLM, Ollama (/v1), LiteLLM, Azure OpenAI-compatible…
 * API keys are read via injected SecretResolver — never stored here.
 */
export interface OpenAICompatibleOptions {
  id: string;
  name: string;
  baseUrl: string;
  priority?: number;
  models: ModelDescriptor[];
  resolveApiKey: () => string | undefined;
  fetchImpl?: typeof fetch;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly info: ProviderInfo;
  readonly models: ModelDescriptor[];
  private readonly resolveApiKey: () => string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAICompatibleOptions) {
    this.resolveApiKey = opts.resolveApiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.models = opts.models;
    this.info = {
      id: opts.id,
      name: opts.name,
      kind: "openai_compatible",
      baseUrl: opts.baseUrl.replace(/\/$/, ""),
      priority: opts.priority ?? 100,
    };
  }

  async complete(
    modelId: string,
    req: CompletionRequest
  ): Promise<{ content: string; usage: { tokensIn: number; tokensOut: number } }> {
    const key = this.resolveApiKey();
    if (!key) {
      throw new AppError("UNAUTHENTICATED", `no API key configured for provider ${this.info.id}`);
    }
    const res = await this.fetchImpl(`${this.info.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 4096,
        temperature: req.temperature ?? 0.2,
      }),
      signal: req.signal,
    });

    if (res.status === 429) throw new AppError("RATE_LIMITED", "provider rate limit hit");
    if (res.status === 401 || res.status === 403) {
      throw new AppError("UNAUTHENTICATED", "provider rejected credentials");
    }
    if (!res.ok) {
      throw new AppError("PROVIDER_FAILURE", `provider HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return {
      content,
      usage: {
        tokensIn: data.usage?.prompt_tokens ?? 0,
        tokensOut: data.usage?.completion_tokens ?? 0,
      },
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const key = this.resolveApiKey();
      if (!key) return false;
      const res = await this.fetchImpl(`${this.info.baseUrl}/models`, {
        headers: { authorization: `Bearer ${key}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
