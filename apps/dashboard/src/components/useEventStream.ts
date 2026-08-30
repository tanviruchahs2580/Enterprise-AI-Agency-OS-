import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";

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
 * Live event stream via SSE. Uses a one-time ticket (key never in URL; the
 * httpOnly session cookie authenticates the request), resumes with Last-Event-ID
 * on reconnect, and degrades silently if the server is unreachable.
 */
export function useEventStream(enabled = true, limit = 60): DomainEvent[] {
  const [events, setEvents] = useState<DomainEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const lastIdRef = useRef<number>(0);

  const connect = useCallback(() => {
    let closed = false;
    (async () => {
      try {
        const { ticket } = await api<{ ticket: string }>("POST", "/events/ticket");
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

/** Thin wrapper over react-query for GET requests against /api/v1 (cookie-first). */
export function useApiQuery<T>(key: string, path: string, options?: { refetchInterval?: number }) {
  return useQuery<T>({
    queryKey: [key],
    queryFn: async () => {
      const res = await api<T>("GET", path);
      return res as T;
    },
    refetchInterval: options?.refetchInterval,
    retry: 1,
  });
}

export function invalidate(qc: QueryClient, key: string) {
  void qc.invalidateQueries({ queryKey: [key] });
}
