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
  /** Secret resolution backend: 'env' (default) | 'mock' (tests) | future vault/aws-sm/doppler */
  SECRET_BACKEND: z.enum(["env", "mock"]).default("env"),
  /** When true, production refuses sensitive keys resolved from plain process env. */
  STRICT_SECRET_BACKEND: Bool(false),
  /** Slow-query logging threshold in ms (0 = off). */
  SLOW_QUERY_LOG_MS: NonNegInt(0),
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

  return cfg;
}
