import { useCallback, useEffect, useRef, useState } from "react";

const KEY_STORAGE = "agencyos.apiKey";

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? "";
}
export function setApiKey(key: string): void {
  localStorage.setItem(KEY_STORAGE, key);
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
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${getApiKey()}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
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

/** Live SSE subscription to the control-plane domain event stream. */
export function useEventStream(enabled = true): DomainEvent[] {
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const ref = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || !getApiKey()) return;
    const es = new EventSource(`/api/v1/events?auth=${encodeURIComponent(getApiKey())}`);
    ref.current = es;
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
      /* EventSource auto-reconnects */
    };
    return () => {
      es.close();
      ref.current = null;
    };
  }, [enabled]);

  return events;
}
