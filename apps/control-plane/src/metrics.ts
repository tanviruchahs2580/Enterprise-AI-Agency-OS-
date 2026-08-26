import type { AppContext } from "./context.ts";

/**
 * Dependency-free Prometheus text-format exposition (GAP G-02).
 * Counters/gauges only — no secrets, no tenant identifiers in labels.
 */

export interface HttpMetricLabels {
  route: string;
  method: string;
  status: number;
}

export class MetricsRegistry {
  private httpCounts = new Map<string, number>();
  private httpDurationBuckets = new Map<string, number>();
  private readonly durationBuckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500];

  observeHttp(labels: HttpMetricLabels, durationMs: number): void {
    const key = `${labels.method}|${labels.route}|${labels.status}`;
    this.httpCounts.set(key, (this.httpCounts.get(key) ?? 0) + 1);
    let bucket = "+Inf";
    for (const b of this.durationBuckets) {
      if (durationMs <= b) {
        bucket = String(b);
        break;
      }
    }
    const bKey = `${labels.method}|${labels.route}|${bucket}`;
    this.httpDurationBuckets.set(bKey, (this.httpDurationBuckets.get(bKey) ?? 0) + 1);
  }

  render(ctx: AppContext): string {
    const lines: string[] = [];
    const org = ctx.defaultOrgId();

    // --- HTTP ---
    lines.push("# HELP agencyos_http_requests_total Total HTTP requests.");
    lines.push("# TYPE agencyos_http_requests_total counter");
    for (const [key, n] of this.httpCounts) {
      const [method, route, status] = key.split("|");
      lines.push(`agencyos_http_requests_total{method="${method}",route="${route}",status="${status}"} ${n}`);
    }
    lines.push("# HELP agencyos_http_request_duration_seconds Request duration.");
    lines.push("# TYPE agencyos_http_request_duration_seconds histogram");
    for (const [key, n] of this.httpDurationBuckets) {
      const [method, route, bucket] = key.split("|");
      lines.push(`agencyos_http_request_duration_seconds_bucket{method="${method}",route="${route}",le="${bucket}"} ${n}`);
    }

    // --- Queue ---
    const stats = ctx.jobs.stats(org);
    lines.push("# HELP agencyos_queue_jobs Jobs by status.");
    lines.push("# TYPE agencyos_queue_jobs gauge");
    for (const s of ["pending", "running", "succeeded", "failed", "dead_letter"]) {
      lines.push(`agencyos_queue_jobs{status="${s}"} ${stats[s] ?? 0}`);
    }

    // --- Model router ---
    const mreq = ctx.db.get<{ total: number }>(
      "SELECT COUNT(*) AS total FROM model_requests"
    );
    const mfail = ctx.db.get<{ total: number }>(
      "SELECT COUNT(*) AS total FROM model_requests WHERE status <> 'succeeded'"
    );
    const mfb = ctx.db.get<{ total: number }>(
      "SELECT COALESCE(SUM(fallback_count),0) AS total FROM model_requests"
    );
    const mcost = ctx.db.get<{ total: number | null }>(
      "SELECT SUM(cost_usd) AS total FROM model_requests WHERE status = 'succeeded'"
    );
    lines.push("# HELP agencyos_model_requests_total Model requests.");
    lines.push("# TYPE agencyos_model_requests_total counter");
    lines.push(`agencyos_model_requests_total ${Number(mreq?.total ?? 0)}`);
    lines.push(`agencyos_model_requests_failed_total ${Number(mfail?.total ?? 0)}`);
    lines.push(`agencyos_model_fallbacks_total ${Number(mfb?.total ?? 0)}`);
    lines.push("# HELP agencyos_model_cost_usd_total Estimated model spend.");
    lines.push("# TYPE agencyos_model_cost_usd_total counter");
    lines.push(`agencyos_model_cost_usd_total ${Number(mcost?.total ?? 0).toFixed(6)}`);

    // --- Executions ---
    const exec = ctx.db.all<{ status: string; n: number }>(
      "SELECT status, COUNT(*) AS n FROM executions GROUP BY status"
    );
    lines.push("# HELP agencyos_executions Executions by status.");
    lines.push("# TYPE agencyos_executions gauge");
    for (const r of exec) {
      lines.push(`agencyos_executions{status="${r.status}"} ${Number(r.n)}`);
    }

    // --- Approvals ---
    const apr = ctx.db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM approvals WHERE decision = 'pending'"
    );
    lines.push("# HELP agencyos_approvals_pending Pending human approvals.");
    lines.push("# TYPE agencyos_approvals_pending gauge");
    lines.push(`agencyos_approvals_pending ${Number(apr?.n ?? 0)}`);

    // --- Autonomous delivery (audit-anchored counters) ---
    const dOk = ctx.db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM audit_events WHERE action='delivery.completed'"
    );
    const dBlocked = ctx.db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM audit_events WHERE action='delivery.blocked'"
    );
    lines.push("# HELP agencyos_delivery_runs_total Autonomous delivery runs by outcome.");
    lines.push("# TYPE agencyos_delivery_runs_total counter");
    lines.push(`agencyos_delivery_runs_total{result="succeeded"} ${Number(dOk?.n ?? 0)}`);
    lines.push(`agencyos_delivery_runs_total{result="blocked"} ${Number(dBlocked?.n ?? 0)}`);

    // --- Database ---
    let dbOk = 1;
    try {
      ctx.db.get("SELECT 1 AS ok");
    } catch {
      dbOk = 0;
    }
    lines.push("# HELP agencyos_database_up Database reachable.");
    lines.push("# TYPE agencyos_database_up gauge");
    lines.push(`agencyos_database_up ${dbOk}`);

    lines.push("# HELP agencyos_build_info Build metadata.");
    lines.push("# TYPE agencyos_build_info gauge");
    lines.push('agencyos_build_info{version="0.6.0"} 1');

    // --- Process (runtime health; no secrets) ---
    const mem = process.memoryUsage();
    const up = process.uptime();
    lines.push("# HELP agencyos_process_resident_memory_bytes Resident set size.");
    lines.push("# TYPE agencyos_process_resident_memory_bytes gauge");
    lines.push(`agencyos_process_resident_memory_bytes ${mem.rss}`);
    lines.push("# HELP agencyos_process_heap_used_bytes Heap used.");
    lines.push("# TYPE agencyos_process_heap_used_bytes gauge");
    lines.push(`agencyos_process_heap_used_bytes ${mem.heapUsed}`);
    lines.push("# HELP agencyos_process_uptime_seconds Process uptime.");
    lines.push("# TYPE agencyos_process_uptime_seconds gauge");
    lines.push(`agencyos_process_uptime_seconds ${up.toFixed(0)}`);

    return lines.join("\n") + "\n";
  }
}

export function metricsRouteLabel(url: string): string {
  // Normalize ONLY id-shaped segments (prefixed ids or long hex) so
  // cardinality stays bounded without collapsing resource names.
  return (
    url
      .split("?")[0]!
      .split("/")
      .map((seg) => {
        if (/^(prj|tsk|agt|exe|org|mis|apr|rev|dep|job|mreq|wfr|rqm|ws|key|bud|cst|knw|art|sec|idk|evt)_[0-9a-zA-Z]+$/i.test(seg)) {
          return ":id";
        }
        if (/^[0-9a-f]{16,}$/i.test(seg)) return ":id";
        return seg;
      })
      .join("/")
      .replace(/\/$/, "") || "/"
  );
}
