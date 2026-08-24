export type Level = "debug" | "info" | "warn" | "error";

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values must never appear in logs (case-insensitive substring match). */
const REDACT_KEYS = [
  "authorization",
  "apikey",
  "api_key",
  "token",
  "secret",
  "password",
  "cookie",
  "session",
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const kl = k.toLowerCase();
      if (REDACT_KEYS.some((r) => kl.includes(r))) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2000) {
    return value.slice(0, 2000) + `…[truncated ${value.length} chars]`;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bound: Record<string, unknown>): Logger;
}

export function createLogger(
  opts: { service: string; level?: Level; sink?: (line: string) => void } ,
  bound: Record<string, unknown> = {}
): Logger {
  const min = LEVELS[opts.level ?? "info"];
  const sink =
    opts.sink ??
    ((line: string) => {
      process.stdout.write(line + "\n");
    });

  function log(level: Level, msg: string, fields?: Record<string, unknown>) {
    if (LEVELS[level] < min) return;
    const rec = {
      ts: new Date().toISOString(),
      level,
      service: opts.service,
      ...redact({ ...bound, ...fields }) as Record<string, unknown>,
      event: msg,
    };
    sink(JSON.stringify(rec));
  }

  return {
    debug: (m, f) => log("debug", m, f),
    info: (m, f) => log("info", m, f),
    warn: (m, f) => log("warn", m, f),
    error: (m, f) => log("error", m, f),
    child: (extra) => createLogger(opts, { ...bound, ...extra }),
  };
}
