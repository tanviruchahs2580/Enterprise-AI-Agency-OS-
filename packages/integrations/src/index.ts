import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@agency/core";

/**
 * GitHub REST adapter (feature-flagged). Only activated when GITHUB_TOKEN is
 * configured; every call is authenticated via the ambient token and never
 * logs credentials. Scope kept deliberately small until verified against the
 * live API (docs/COMPATIBILITY-MATRIX.md).
 */
export class GitHubAdapter {
  private readonly base: string;
  private readonly token?: string;

  constructor(opts: { token?: string; apiBase?: string }) {
    this.token = opts.token;
    this.base = (opts.apiBase ?? "https://api.github.com").replace(/\/$/, "");
  }

  get enabled(): boolean {
    return Boolean(this.token);
  }

  private headers(): Record<string, string> {
    if (!this.token) throw new AppError("UNAUTHENTICATED", "GITHUB_TOKEN not configured");
    return {
      authorization: `Bearer ${this.token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "enterprise-ai-agency-os",
      "content-type": "application/json",
    };
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    fetchImpl: typeof fetch = fetch
  ): Promise<{ status: number; data: T | null }> {
    const res = await fetchImpl(`${this.base}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      throw new AppError("RATE_LIMITED", "GitHub rate limit exceeded");
    }
    if (!res.ok && res.status !== 304) {
      throw new AppError("PROVIDER_FAILURE", `GitHub API ${res.status} on ${method} ${path}`);
    }
    const text = await res.text();
    return { status: res.status, data: text ? (JSON.parse(text) as T) : null };
  }

  createIssue(
    repo: string,
    issue: { title: string; body: string; labels?: string[] },
    fetchImpl?: typeof fetch
  ): Promise<{ status: number; data: unknown }> {
    return this.request("POST", `/repos/${repo}/issues`, issue, fetchImpl);
  }

  createPullRequest(
    repo: string,
    pr: { title: string; head: string; base: string; body: string },
    fetchImpl?: typeof fetch
  ): Promise<{ status: number; data: unknown }> {
    return this.request("POST", `/repos/${repo}/pulls`, pr, fetchImpl);
  }

  addIssueComment(repo: string, issueNumber: number, body: string): Promise<{ status: number; data: unknown }> {
    return this.request("POST", `/repos/${repo}/issues/${issueNumber}/comments`, { body });
  }
}

/** HMAC-signed outbound webhook emitter with bounded retries (blueprint §5/§72). */
export class SignedWebhookEmitter {
  constructor(private opts: { url?: string; secret?: string }) {}

  sign(payload: string, timestamp: string): string {
    const secret = this.opts.secret;
    if (!secret) throw new AppError("VALIDATION_ERROR", "webhook secret not configured");
    return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  }

  verify(payload: string, timestamp: string, signature: string): boolean {
    const expected = this.sign(payload, timestamp);
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature.replace(/^sha256=/, "")));
    } catch {
      return false;
    }
  }

  async emit(eventType: string, payload: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<boolean> {
    if (!this.opts.url || !this.opts.secret) return false; // disabled
    const body = JSON.stringify({ type: eventType, payload, ts: new Date().toISOString() });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const ts = Math.floor(Date.now() / 1000).toString();
        const res = await fetchImpl(this.opts.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-agencyos-signature": `sha256=${this.sign(body, ts)}`,
            "x-agencyos-timestamp": ts,
          },
          body,
        });
        if (res.ok) return true;
        if (res.status < 500) return false; // non-retryable
      } catch {
        /* network error → retry */
      }
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
    return false;
  }
}
