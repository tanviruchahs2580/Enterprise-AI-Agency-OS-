import { AppError } from "./errors.ts";
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
  /**
   * Optional async warm-up (e.g. Vault cache fill). Called once at boot
   * before the server serves traffic; absent for synchronous backends.
   */
  prime?(names: readonly string[]): Promise<void>;
  /** Names an async backend could not resolve during prime (if supported). */
  readonly missing?: readonly string[];
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

export interface VaultOptions {
  /** Vault server root URL (e.g. https://vault.example.com). */
  addr: string;
  /** KV version-2 mount point (default "secret"). */
  kvMount?: string;
  /** Optional path prefix beneath the mount (e.g. "agencyos/prod"). */
  pathPrefix?: string;
  /** Static Vault token (alternative to AppRole). */
  token?: string;
  /** AppRole role_id (alternative to a static token). */
  roleId?: string;
  /** AppRole secret_id (alternative to a static token). */
  secretId?: string;
  /** Optional Vault Enterprise namespace. */
  namespace?: string;
  fetchImpl?: typeof fetch;
}

/**
 * HashiCorp Vault KV (version 2) adapter (audit T-D).
 *
 * The `SecretResolver` interface is synchronous, so the resolver fetches and
 * caches secret material up front via `prime(names)` (called at boot) and
 * serves `get(name)` from that in-memory cache. Auth: static token or AppRole
 * (role_id + secret_id exchanged for a client token over the auth/approle
 * login endpoint). Secret name `N` maps to `{mount}/data/{prefix}/{N}`.
 */
export class VaultSecretResolver implements SecretResolver {
  readonly backend = "vault";
  /** Names that fail to resolve during prime — surfaced so boot can decide. */
  readonly missing: string[] = [];
  private readonly opts: VaultOptions;
  private readonly fetchImpl: typeof fetch;
  private token?: string;
  private readonly cache = new Map<string, string>();

  // NOTE: no TS parameter properties — Node strip-types rejects them (ADR-0003).
  constructor(opts: VaultOptions) {
    this.opts = opts;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    const addr = opts.addr.replace(/\/+$/, "");
    if (!addr) throw new AppError("VALIDATION_ERROR", "vault backend requires an addr");
    this.opts = { ...opts, addr };
    if (!opts.token && !(opts.roleId && opts.secretId)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "vault backend requires a static token or AppRole role_id + secret_id"
      );
    }
    if (opts.token) this.token = opts.token;
  }

  /** Base URL of the secrets mount, e.g. https://vault:8200/v1/secret/data */
  private dataBase(): string {
    const prefix = this.opts.pathPrefix?.replace(/\//g, "/").replace(/^\/+|\/+$/g, "");
    return `${this.opts.addr}/v1/${this.opts.kvMount ?? "secret"}/data${prefix ? `/${prefix}` : ""}`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "x-vault-token": this.requireToken(),
      "content-type": "application/json",
    };
    if (this.opts.namespace) h["x-vault-namespace"] = this.opts.namespace;
    return h;
  }

  private requireToken(): string {
    if (this.token) return this.token;
    throw new AppError("INTERNAL", "vault resolver has no token (prime() not run?)");
  }

  private async ensureToken(): Promise<void> {
    if (this.token) return;
    const { roleId, secretId } = this.opts;
    if (!roleId || !secretId) {
      throw new AppError("VALIDATION_ERROR", "vault AppRole login requires role_id and secret_id");
    }
    const res = await this.fetchImpl(`${this.opts.addr}/v1/auth/approle/login`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.opts.namespace ? { "x-vault-namespace": this.opts.namespace } : {}) },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
    });
    if (!res.ok) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", `vault AppRole login failed (HTTP ${res.status})`);
    }
    const body = (await res.json()) as { auth?: { client_token?: string } };
    const token = body.auth?.client_token;
    if (!token) throw new AppError("DEPENDENCY_UNAVAILABLE", "vault AppRole login returned no client_token");
    this.token = token;
  }

  private async readOne(name: string): Promise<string | undefined> {
    await this.ensureToken();
    const url = `${this.dataBase()}/${encodeURIComponent(name)}`;
    const res = await this.fetchImpl(url, { headers: this.headers() });
    if (res.status === 404) return undefined;
    if (!res.ok) {
      throw new AppError("DEPENDENCY_UNAVAILABLE", `vault read '${name}' failed (HTTP ${res.status})`);
    }
    const body = (await res.json()) as { data?: { data?: Record<string, unknown> } };
    const leaf = body.data?.data ?? {};
    // Deterministic resolution: prefer `value`, then the secret's own name.
    if ("value" in leaf) return String(leaf.value);
    return name in leaf ? String(leaf[name]) : undefined;
  }

  /**
   * Fetches the given names from Vault into the in-memory cache. Call once at
   * boot before the server serves traffic; names not backed by a secret are
   * recorded in `missing` and resolve to undefined afterwards.
   */
  async prime(names: readonly string[]): Promise<void> {
    const todo = names.filter((n) => !this.cache.has(n));
    for (const name of todo) {
      const hit = await this.readOne(name);
      if (hit === undefined) this.missing.push(name);
      else this.cache.set(name, hit);
    }
  }

  get(name: string): string | undefined {
    return this.cache.get(name);
  }
}

export const SENSITIVE_KEYS = [
  "MODEL_PROVIDER_API_KEY",
  "WEBHOOK_OUTBOUND_SECRET",
  "GITHUB_TOKEN",
] as const;

export function createSecretResolver(cfg: AppConfig, env: NodeJS.ProcessEnv = process.env): SecretResolver {
  if (cfg.SECRET_BACKEND === "mock") return new MockSecretResolver();
  if (cfg.SECRET_BACKEND === "vault") {
    return new VaultSecretResolver({
      addr: cfg.VAULT_ADDR!,
      kvMount: cfg.VAULT_KV_MOUNT,
      pathPrefix: cfg.VAULT_PATH_PREFIX,
      token: cfg.VAULT_TOKEN,
      roleId: cfg.VAULT_ROLE_ID,
      secretId: cfg.VAULT_SECRET_ID,
      namespace: cfg.VAULT_NAMESPACE,
    });
  }
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
