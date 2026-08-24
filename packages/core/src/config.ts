import { z } from "zod";

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
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigValidationError(
      parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    );
  }
  const cfg = parsed.data;

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
  }

  return cfg;
}
