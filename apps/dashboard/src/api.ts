import { useCallback, useEffect, useState } from "react";

// Security (audit Phase 1.2): the admin key is NEVER persisted in browser
// storage (sessionStorage/localStorage are both XSS-readable). Authentication
// rides on an httpOnly SameSite cookie issued by POST /api/v1/auth/session.
// The raw key exists only in a module-scoped variable for the exchange and as
// a development-only bootstrap fallback; it is not written anywhere.
//
// Local-dev convenience: with no configured key the dashboard falls back to the
// bootstrap admin key so it works out of the box against a control plane started
// with ADMIN_BOOTSTRAP_KEY=demo-key. Production builds never embed a default key;
// the operator sets a real key via Settings, which is then exchanged for a cookie.
const DEFAULT_LOCAL_KEY = import.meta.env.DEV ? "demo-key" : "";
let memKey: string | null = null;
let sessionReady = false;

export function getApiKey(): string {
  if (memKey !== null) return memKey;
  memKey = DEFAULT_LOCAL_KEY;
  return memKey;
}
export function setApiKey(key: string): void {
  memKey = key;
  sessionReady = false; // re-establish a fresh httpOnly session with the new key
}
export function clearApiKey(): void {
  memKey = null;
  sessionReady = false;
  // Best-effort logout: revoke the server-side session cookie.
  try {
    void fetch("/api/v1/auth/session", { method: "DELETE", credentials: "include" });
  } catch {
    /* control plane unreachable during sign-out is non-fatal */
  }
}

function fetchWithAuth(
  url: string,
  method: string,
  body?: unknown,
  useKey = false
): Promise<Response> {
  const hasBody = body !== undefined;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (useKey) {
    const key = getApiKey();
    if (key) headers.authorization = `Bearer ${key}`;
  }
  return fetch(url, {
    method,
    headers,
    credentials: "include",
    body: hasBody ? JSON.stringify(body) : method === "GET" || method === "DELETE" ? undefined : "{}",
  });
}

/** Exchange the in-memory key for an httpOnly session cookie (idempotent). */
async function ensureSession(): Promise<boolean> {
  if (sessionReady) return true;
  if (!getApiKey()) return false;
  try {
    const res = await fetchWithAuth("/api/v1/auth/session", "POST", {}, true);
    if (res.ok) {
      sessionReady = true;
      return true;
    }
  } catch {
    /* keep sessionReady=false; caller retries via the key path */
  }
  return false;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  // All control-plane routes are served under /api/v1 (including health/readiness
  // aliases) so the Vite dev proxy forwards them to the API instead of serving SPA HTML.
  const url = path.startsWith("/api/v1") ? path : `/api/v1${path}`;

  // Cookie-first: never attach the raw key unless the httpOnly session cookie
  // is unavailable. A single 401 triggers a cookie exchange + one retry.
  let res = await fetchWithAuth(url, method, body, false);
  if (res.status === 401 && !sessionReady) {
    if (await ensureSession()) {
      res = await fetchWithAuth(url, method, body, false);
    } else {
      // No cookie and no way to establish one — fall back to the raw key path
      // (non-browser clients / test harnesses that cannot hold cookies).
      res = await fetchWithAuth(url, method, body, true);
    }
  }

  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!ct.includes("application/json") && text.trimStart().startsWith("<")) {
    throw new ApiError(502, "BAD_GATEWAY", "Control plane unreachable (received HTML). Is the API server running on :3000?");
  }
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(502, "BAD_GATEWAY", "Control plane returned a non-JSON response.");
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } }).error ?? {};
    throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? res.statusText);
  }
  return json as T;
}

export function useApi<T>(path: string, deps: unknown[] = []): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    api<T>("GET", path)
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e: Error) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [path, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

export interface DomainEvent {
  eventId: string;
  type: string;
  actorId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

/** Live SSE subscription via one-time tickets (API key never in URL; the
 *  session httpOnly cookie authenticates the request). */
export function useEventStream(enabled = true): DomainEvent[] {
  const [events, setEvents] = useState<DomainEvent[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let es: EventSource | null = null;
    let closed = false;

    (async () => {
      try {
        const t = await api<{ ticket: string }>("POST", "/events/ticket");
        if (closed) return;
        es = new EventSource(`/api/v1/events?ticket=${encodeURIComponent(t.ticket)}`);
        const onDomain = (ev: MessageEvent<string>) => {
          try {
            const e = JSON.parse(ev.data) as DomainEvent;
            setEvents((prev) => [e, ...prev].slice(0, 60));
          } catch {
            /* ignore malformed */
          }
        };
        es.addEventListener("domain", onDomain as never);
        es.onerror = () => {
          /* EventSource auto-reconnects; ticket single-use — reconnect gets a new one */
          if (es && es.readyState === 2 && !closed) {
            es.close();
            // re-arm with a fresh ticket
            setTimeout(() => {
              if (!closed) setEvents((prev) => [...prev]);
            }, 1000);
          }
        };
      } catch {
        /* control plane unreachable; retry not critical for UI */
      }
    })();

    return () => {
      closed = true;
      es?.close();
    };
  }, [enabled]);

  return events;
}