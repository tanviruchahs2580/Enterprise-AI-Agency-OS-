import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getApiKey } from "../api.ts";

export interface DomainEvent {
  seq?: number;
  eventId?: string;
  type: string;
  label?: string;
  actorId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}

/**
 * Live event stream via SSE. Uses a one-time ticket (API key never in URL),
 * resumes with Last-Event-ID on reconnect, and falls back to nothing if the
 * server is unreachable (UI does not block on telemetry).
 */
export function useEventStream(enabled = true, limit = 60): DomainEvent[] {
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<number>(0);

  const connect = useCallback(() => {
    const key = getApiKey();
    if (!key) return;
    let closed = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/events/ticket", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: "{}",
        });
        if (!res.ok) return;
        const { ticket } = (await res.json()) as { ticket: string };
        if (closed) return;
        const url = `/api/v1/events?ticket=${encodeURIComponent(ticket)}`;
        const es = new EventSource(url);
        esRef.current = es;
        es.addEventListener("domain", (ev) => {
          try {
            const e = JSON.parse((ev as MessageEvent).data) as DomainEvent;
            if (e.seq) lastIdRef.current = e.seq;
            setEvents((prev) => [e, ...prev].slice(0, limit));
          } catch {}
        });
        es.onerror = () => {
          es.close();
          if (!closed) setTimeout(connect, 1500);
        };
      } catch {}
    })();
    return () => {
      closed = true;
      esRef.current?.close();
    };
  }, [limit]);

  useEffect(() => {
    if (!enabled) return;
    return connect();
  }, [enabled, connect]);

  return events;
}

/** Thin wrapper over react-query for GET requests against /api/v1. */
export function useApiQuery<T>(key: string, path: string, options?: { refetchInterval?: number }) {
  return useQuery<T>({
    queryKey: [key],
    queryFn: async () => {
      const key2 = getApiKey();
      const res = await fetch(path.startsWith("/") && !path.startsWith("/api") ? path : `/api/v1${path}`, {
        headers: { authorization: `Bearer ${key2}` },
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(err.error?.message ?? res.statusText);
      }
      return (await res.json()) as T;
    },
    refetchInterval: options?.refetchInterval,
    retry: 1,
  });
}

export function invalidate(qc: QueryClient, key: string) {
  void qc.invalidateQueries({ queryKey: [key] });
}
