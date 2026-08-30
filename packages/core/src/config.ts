import { z } from "zod";
import { existsSync } from "node:fs";

export type EnvProfile = "local" | "test" | "staging" | "production";

const Bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : ["1", "true", "yes", "on"].includes(v.toLowerCase())));

const Int = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .refine((n) => Number.isFinite(n) && n > 0, "must be a positive integer");

/** Port allows 0 (ephemeral) for tests. */
const Port = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .refine((n) => Number.isInteger(n) && n >= 0 && n <= 65535, "must be a valid port");

/** Non-negative integer (allows 0 = disabled). */
const NonNegInt = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : Number.parseInt(v, 10)))
    .refine((n) => Number.isInteger(n) && n >= 0, "must be a non-negative integer");

export const configSchema = z.object({
  NODE_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  HOST: z.string().default("127.0.0.1"),
  PORT: Port(3000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().default("./data/agencyos.sqlite"),
  /** Comma-separated origins; "*" allowed only for non-production. */
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:8080"),
  RATE_LIMIT_WINDOW_MS: Int(60_000),
  RATE_LIMIT_MAX: Int(600),
  SANDBOX_PROVIDER: z.enum(["process", "docker"]).default("process"),
  ADMIN_BOOTSTRAP_KEY: z.string().optional(),
  /** Sensitive — routed through SecretResolver (Phase 0.5). */
  MODEL_PROVIDER_API_KEY: z.string().optional(),
  RATE_LIMIT_STORE: z.enum(["memory", "postgres"]).default("memory"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_API_BASE: z.string().url().default("https://api.github.com"),
  WEBHOOK_OUTBOUND_URL: z.string().url().optional(),
  WEBHOOK_OUTBOUND_SECRET: z.string().optional(),
  MODEL_DEFAULT_TIER: z
    .enum(["FAST", "STANDARD", "REASONING", "REVIEW", "SECURITY", "VISION", "LOCAL"])
    .default("STANDARD"),
  // Feature flags — optional subsystems must not break boot.
  FEATURE_BROWSER_AUTOMATION: Bool(false),
  FEATURE_AGENTIC_SOC: Bool(true),
  FEATURE_A2A: Bool(false),
  FEATURE_HERMES: Bool(false),
  FEATURE_VECTOR_KNOWLEDGE: Bool(false),
  FEATURE_GITHUB: Bool(false),
  /** PHASE B2: enable LLM advisory reviewers (deterministic gates stay authoritative). */
  FEATURE_LLM_REVIEWER: Bool(false),
  /** PHASE B4: specialist agent handlers (pm/architect/sre) — default off. */
  FEATURE_AGENT_SPECIALISTS: Bool(false),
  // ---- enterprise hardening (Phase 0) ----
  /** Secret resolution backend: 'env' (default) | 'mock' (tests) | 'vault' (HashiCorp Vault KV v2) */
  SECRET_BACKEND: z.enum(["env", "mock", "vault"]).default("env"),
  /** When true, production refuses sensitive keys resolved from plain process env. */
  STRICT_SECRET_BACKEND: Bool(false),
  // ---- HashiCorp Vault backend (T-D: secret resolution adapter) ----
  /** Vault server root URL, e.g. https://vault.example.com. */
  VAULT_ADDR: z.string().url().optional(),
  /** Static Vault token (alternative to AppRole). */
  VAULT_TOKEN: z.string().optional(),
  /** AppRole role_id (alternative to a static token). */
  VAULT_ROLE_ID: z.string().optional(),
  /** AppRole secret_id (alternative to a static token). */
  VAULT_SECRET_ID: z.string().optional(),
  /** KV version-2 secrets mount (default "secret"). */
  VAULT_KV_MOUNT: z.string().default("secret"),
  /** Optional path prefix beneath the mount, e.g. "agencyos/prod". */
  VAULT_PATH_PREFIX: z.string().optional(),
  /** Optional Vault Enterprise namespace header. */
  VAULT_NAMESPACE: z.string().optional(),
  /** Slow-query logging threshold in ms (0 = off). */
  SLOW_QUERY_LOG_MS: NonNegInt(0),
  // ---- auth sessions (audit Phase 1.2: httpOnly cookie) ----
  /** Name of the httpOnly session cookie issued by POST /api/v1/auth/session. */
  SESSION_COOKIE_NAME: z.string().default("agencyos_session"),
  /** Session lifetime in ms (default 24h). */
  SESSION_TTL_MS: Int(86_400_000),
  /** Force the Secure flag even outside production (e.g. TLS-terminated staging). */
  SESSION_COOKIE_SECURE: Bool(false),
  // ---- OIDC/SSO (audit Phase 2: ADR-0007 IdentityProvider seam) ----
  /** Enable the OIDC Authorization Code + PKCE flow (login + callback routes). */
  OIDC_ENABLED: Bool(false),
  /** Issuer URL; the /.well-known/openid-configuration document is discovered from it. */
  OIDC_ISSUER: z.string().url().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  /**
   * Full callback URL registered with the IdP. When absent it is derived from
   * the request Host (useful behind a proxy on the same origin as the API).
   */
  OIDC_REDIRECT_URI: z.string().url().optional(),
  /** JWT claim (string or array of strings) that carries the target role. */
  OIDC_ROLE_CLAIM: z.string().default("roles"),
  /** JWT claim that carries the target org id; falls back to the default org. */
  OIDC_ORG_CLAIM: z.string().default("org"),
  // ---- at-rest / per-workspace encryption (audit Phases 3-4) ----
  /** Master key (base64, 32 bytes) for envelope encryption. Absent = encryption disabled. */
  ENCRYPTION_MASTER_KEY: z.string().optional(),
  /** Encrypt sensitive payload fields at rest when a master key is configured. */
  ENCRYPT_AT_REST: Bool(false),
  // ---- OpenTelemetry tracing (T-F) ----
  /** Enable OTLP exporting; requires one of the OTEL_EXPORTER_OTLP_*_ENDPOINT vars. */
  OTEL_ENABLED: Bool(false),
  /** Collector base URL (OTLP/HTTP), e.g. http://otel-collector:4318. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  /** Full traces endpoint override, e.g. http://collector:4318/v1/traces. */
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

export class ConfigValidationError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`Invalid configuration:\n${issues.join("\n")}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

/**
 * Parse and validate configuration. Fails fast on invalid production config.
 * In production, requires explicit admin bootstrap key.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts?: { isContainer?: boolean }
): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigValidationError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    );
  }
  const cfg = parsed.data;
  const isContainer = opts?.isContainer ?? existsSync("/.dockerenv");

  if (cfg.NODE_ENV === "production") {
    if (!cfg.ADMIN_BOOTSTRAP_KEY) {
      throw new ConfigValidationError([
        "production requires ADMIN_BOOTSTRAP_KEY to be set explicitly",
      ]);
    }
    if (!cfg.DATABASE_URL.startsWith("postgres")) {
      throw new ConfigValidationError([
        "production requires a PostgreSQL DATABASE_URL (postgres://…)",
      ]);
    }
    if (cfg.CORS_ORIGIN.includes("*")) {
      throw new ConfigValidationError(["wildcard CORS is forbidden in production"]);
    }
    // Phase 0.2/A4: process sandbox refused on bare-metal production. Inside a
    // hardened container (read-only rootfs, caps dropped) the container IS the
    // sandbox — process execution there is acceptable and keeps the all-in-one
    // compose profile functional without nested docker.
    if (cfg.SANDBOX_PROVIDER === "process" && !isContainer) {
      throw new ConfigValidationError([
        "production requires SANDBOX_PROVIDER=docker on bare metal (process sandbox allowed only inside a hardened container)",
      ]);
    }
    if (cfg.STRICT_SECRET_BACKEND && cfg.SECRET_BACKEND === "env") {
      const sensitive = ["MODEL_PROVIDER_API_KEY", "WEBHOOK_OUTBOUND_SECRET", "GITHUB_TOKEN"]
        .filter((k) => env[k]);
      if (sensitive.length > 0) {
        throw new ConfigValidationError([
          `STRICT_SECRET_BACKEND=true forbids plain-env secrets; move ${sensitive.join(", ")} to a secrets backend`,
        ]);
      }
    }
  }

  // Secret-backend preconditions apply in every environment — opting into the
  // vault backend is explicit, so fail fast even in dev rather than silently
  // resolving nothing at request time.
  if (cfg.SECRET_BACKEND === "vault" && !cfg.VAULT_ADDR) {
    throw new ConfigValidationError(["SECRET_BACKEND=vault requires VAULT_ADDR"]);
  }
  if (
    cfg.SECRET_BACKEND === "vault" &&
    !cfg.VAULT_TOKEN &&
    !(cfg.VAULT_ROLE_ID && cfg.VAULT_SECRET_ID)
  ) {
    throw new ConfigValidationError([
      "SECRET_BACKEND=vault requires VAULT_TOKEN or VAULT_ROLE_ID+VAULT_SECRET_ID",
    ]);
  }

  // At-rest encryption is opt-in and must never silently degrade to plaintext.
  if (cfg.ENCRYPT_AT_REST && !cfg.ENCRYPTION_MASTER_KEY) {
    throw new ConfigValidationError([
      "ENCRYPT_AT_REST=true requires ENCRYPTION_MASTER_KEY (base64 32-byte key)",
    ]);
  }

  return cfg;
}
