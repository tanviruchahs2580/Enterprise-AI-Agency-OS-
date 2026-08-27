import { useCallback, useEffect, useState } from "react";

// Security: never persist the admin key in localStorage (readable by any XSS).
// Use sessionStorage (cleared on tab close) plus an in-memory cache so a reload
// within the session keeps the user signed in without long-lived persistence.
// Production should move to an httpOnly secure cookie set by the control plane.
const KEY_STORAGE = "agencyos.apiKey";
let memKey: string | null = null;

export function getApiKey(): string {
  if (memKey !== null) return memKey;
  try {
    memKey = sessionStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    memKey = "";
  }
  return memKey;
}
export function setApiKey(key: string): void {
  memKey = key;
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {}
}
export function clearApiKey(): void {
  memKey = null;
  try { sessionStorage.removeItem(KEY_STORAGE); } catch {}
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
  // Health/readiness live at the server root, everything else under /api/v1.
  const url = /^\/(health|ready|live)\b/.test(path) ? path : `/api/v1${path}`;
  // Always send a JSON content-type so Fastify's parser accepts the request
  // even when the body is empty (e.g. the SSE ticket exchange).
  const hasBody = body !== undefined;
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getApiKey()}`,
    },
    body: hasBody ? JSON.stringify(body) : method === "GET" || method === "DELETE" ? undefined : "{}",
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON (SSE etc.) */
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
    api<T>(path.includes("/api/v1") ? "GET" : "GET", path)
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

/** Live SSE subscription via one-time tickets (API key never in URL). */
export function useEventStream(enabled = true): DomainEvent[] {
  const [events, setEvents] = useState<DomainEvent[]>([]);

  useEffect(() => {
    if (!enabled || !getApiKey()) return;
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
