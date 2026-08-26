import type { AppConfig } from "./config.ts";

/**
 * Secret resolution seam (Phase 0.5). Production deployments should back this
 * with Vault / AWS Secrets Manager / Doppler; the env backend exists for dev
 * and CI, and `STRICT_SECRET_BACKEND=true` forbids it in production for
 * sensitive keys (enforced in config.ts).
 */
export interface SecretResolver {
  readonly backend: string;
  /** Returns the secret material or undefined when not configured. */
  get(name: string): string | undefined;
}

export class EnvSecretResolver implements SecretResolver {
  readonly backend = "env";
  private readonly env: NodeJS.ProcessEnv;

  // NOTE: no TS parameter properties — Node strip-types rejects them (ADR-0003)
  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env;
  }

  get(name: string): string | undefined {
    return this.env[name];
  }
}

/** Deterministic mock for tests: any name → `mock-<name>` (never real). */
export class MockSecretResolver implements SecretResolver {
  readonly backend = "mock";
  get(name: string): string {
    return `mock-${name}`;
  }
}

const SENSITIVE_KEYS = [
  "MODEL_PROVIDER_API_KEY",
  "WEBHOOK_OUTBOUND_SECRET",
  "GITHUB_TOKEN",
] as const;

export function createSecretResolver(cfg: AppConfig, env: NodeJS.ProcessEnv = process.env): SecretResolver {
  if (cfg.SECRET_BACKEND === "mock") return new MockSecretResolver();
  return new EnvSecretResolver(env);
}

/**
 * Resolves a sensitive key through the active backend. In production with a
 * strict policy, plain-env resolution of sensitive keys is refused here too
 * (defense-in-depth alongside the config gate).
 */
export function resolveSensitive(
  cfg: AppConfig,
  name: (typeof SENSITIVE_KEYS)[number],
  resolvers: Record<string, SecretResolver> = {},
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const custom = resolvers[cfg.SECRET_BACKEND];
  if (custom) return custom.get(name);
  if (cfg.NODE_ENV === "production" && cfg.STRICT_SECRET_BACKEND && SENSITIVE_KEYS.includes(name)) {
    throw new Error(`refusing plain-env secret '${name}' under STRICT_SECRET_BACKEND`);
  }
  if (cfg.SECRET_BACKEND === "mock") return new MockSecretResolver().get(name);
  return env[name];
}
