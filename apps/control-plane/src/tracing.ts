import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { trace, type Span, type Tracer, type Attributes, SpanStatusCode } from "@opentelemetry/api";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { FastifyInstrumentation } from "@opentelemetry/instrumentation-fastify";
import type { AppConfig } from "@agency/core";
import { AGENCY_OS_VERSION } from "./version.ts";

/**
 * T-F: OpenTelemetry distributed tracing (previously blocked on deps/creds).
 *
 * Wires the control plane into an OpenTelemetry collector over OTLP/HTTP.
 * Activation is explicit and environment-driven:
 *   - OTEL_ENABLED=true, plus
 *   - OTEL_EXPORTER_OTLP_ENDPOINT=<collector base URL> or
 *     OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=<full OTLP traces endpoint>
 *
 * Auto-instrumentation covers incoming HTTP (undici-fetch, inbound requests)
 * and Fastify handlers so every API call becomes a parent span carrying
 * trace_id/span_id; services can join the trace via the `traceparent` header.
 */

export const AGENCY_OS_TRACING_VERSION = AGENCY_OS_VERSION;

export interface TracingHandle {
  readonly enabled: boolean;
  tracer(): Tracer | undefined;
  shutdown(): Promise<void>;
}

let tracerRef: Tracer | undefined;

function tracesEndpoint(cfg: AppConfig): string | undefined {
  if (!cfg.OTEL_ENABLED) return undefined;
  if (cfg.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT) return cfg.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const base = (cfg.OTEL_EXPORTER_OTLP_ENDPOINT ?? "").replace(/\/+$/, "");
  return base ? `${base}/v1/traces` : undefined;
}

let activeHandle: TracingHandle | undefined;

export function initTracing(cfg: AppConfig): TracingHandle {
  const url = tracesEndpoint(cfg);
  if (!url) {
    return { enabled: false, tracer: () => undefined, shutdown: async () => {} };
  }

  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url, concurrencyLimit: 10 }),
    instrumentations: [new HttpInstrumentation(), new FastifyInstrumentation()],
    resource: resourceFromAttributes({
      [SemanticResourceAttributes.SERVICE_NAME]: "agency-os-control-plane",
      [SemanticResourceAttributes.SERVICE_VERSION]: AGENCY_OS_TRACING_VERSION,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: cfg.NODE_ENV,
    }),
  });

  sdk.start();
  tracerRef = trace.getTracer("agency-os");

  activeHandle = {
    enabled: true,
    tracer: () => tracerRef,
    shutdown: async () => {
      try {
        await sdk?.shutdown();
      } catch {
        // best-effort flush during shutdown
      }
      tracerRef = undefined;
      activeHandle = undefined;
    },
  };
  return activeHandle;
}

/** Returns the active tracing handle (initTracing result) if any. */
export function tracingHandle(): TracingHandle | undefined {
  return activeHandle;
}

/**
 * Runs `fn` inside a child span; failures are recorded as ERROR status spans.
 * When tracing is disabled the fn runs unadorned (handle.enabled === false).
 */
export async function withSpan<T>(
  handle: TracingHandle,
  name: string,
  attrs: Attributes,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  const tracer = handle.tracer();
  if (!tracer) return fn(undefined as unknown as Span);
  return tracer.startActiveSpan(name, async (span) => {
    try {
      span.setAttributes(attrs);
      const out = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return out;
    } catch (e) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: e instanceof Error ? e.message : String(e),
      });
      span.recordException(e instanceof Error ? e : new Error(String(e)));
      throw e;
    } finally {
      span.end();
    }
  });
}