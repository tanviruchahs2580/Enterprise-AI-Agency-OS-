import { EventEmitter } from "node:events";
import { newId } from "./ids.ts";

export type ActorType = "user" | "agent" | "system" | "webhook";

export interface DomainEvent<T = unknown> {
  eventId: string;
  type: string;
  orgId?: string;
  actorType: ActorType;
  actorId: string;
  occurredAt: string; // ISO timestamp (server-authoritative)
  correlationId?: string;
  causationId?: string;
  payload: T;
}

type Handler = (e: DomainEvent) => void | Promise<void>;

/**
 * In-process pub/sub with error isolation. Handlers run sequentially;
 * a throwing handler never breaks other subscribers or the publisher.
 */
export class EventBus {
  private emitter = new EventEmitter();
  private buffer: DomainEvent[] = [];
  private bufferSize: number;

  constructor(bufferSize = 1000) {
    this.bufferSize = bufferSize;
    this.emitter.setMaxListeners(100);
  }

  emit(e: Omit<DomainEvent, "eventId" | "occurredAt"> & Partial<Pick<DomainEvent, "eventId" | "occurredAt">>): DomainEvent {
    const full: DomainEvent = {
      eventId: e.eventId ?? newId("evt"),
      type: e.type,
      orgId: e.orgId,
      actorType: e.actorType,
      actorId: e.actorId,
      occurredAt: e.occurredAt ?? new Date().toISOString(),
      correlationId: e.correlationId,
      causationId: e.causationId,
      payload: e.payload,
    };
    this.buffer.push(full);
    if (this.buffer.length > this.bufferSize) this.buffer.shift();

    for (const h of this.emitter.rawListeners("event") as Handler[]) {
      try {
        const r = h.call(null, full);
        if (r instanceof Promise) r.catch(() => {/* isolated */});
      } catch {
        /* isolated — handler errors must not break publishers */
      }
    }
    return full;
  }

  subscribe(handler: Handler): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  /** Recent events (for SSE catch-up). */
  recent(limit = 100): readonly DomainEvent[] {
    return this.buffer.slice(-limit);
  }
}
