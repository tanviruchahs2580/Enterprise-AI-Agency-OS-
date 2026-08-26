import { useEffect, useState } from "react";
import { useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface DeliveryRun {
  executionId: string;
  taskId: string;
  taskTitle: string;
  status: string;
  traceId: string;
  summary: string | null;
  errorCode: string | null;
  receipt: 0 | 1;
  createdAt: string;
  finishedAt: string | null;
}

const AUTO_MS = 5000;

/** PHASE 10: human-readable labels for delivery pipeline stages. */
const STAGE_LABELS: Record<string, string> = {
  worktree_created: "Isolated worktree",
  code_generated: "Code generated",
  static_analysis: "Static analysis",
  fault_injected: "Fault injected (demo)",
  tests_run: "Tests executed",
  repair_attempted: "Self-heal repair",
  contract_verified: "Contract verified",
  benchmark_run: "Benchmark",
  docs_generated: "Docs generated",
  review_completed: "Review gate",
  committed: "Committed",
  merged: "Merged to main",
  converged: "Converged (no net diff)",
  postmerge_verified: "Post-merge verified",
  postmerge_reverted: "Auto-reverted",
};

export default function Delivery() {
  const { data, error, loading, reload } = useApi<{ items: DeliveryRun[] }>(
    "/delivery/runs?limit=100"
  );
  const items = data?.items ?? null;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (tick > 0) reload();
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), AUTO_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <h1>Autonomous Delivery</h1>
      <p className="subtitle">
        Requirement → worktree → codegen → static analysis → tests → self-heal → contract → benchmark → docs → review → merge → post-merge.
        Auto-refreshes every {AUTO_MS / 1000}s.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="secondary small" onClick={() => setTick((t) => t + 1)}>Refresh now</button>
        {items && (
          <span className="muted">
            {items.filter((r) => r.status === "succeeded").length} succeeded ·{" "}
            {items.filter((r) => r.status !== "succeeded").length} other
          </span>
        )}
      </div>

      {loading && !items ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (items ?? []).length === 0 ? (
        <Empty what="delivery runs — dispatch one from a ready delivery task" />
      ) : (
        <Panel title={`Runs (${items!.length})`}>
          <table>
            <thead>
              <tr><th>Execution</th><th>Task</th><th>Status</th><th>Receipt</th><th>Summary</th><th>Finished</th></tr>
            </thead>
            <tbody>
              {(items ?? []).map((r) => (
                <tr key={r.executionId}>
                  <td className="mono muted">{r.executionId.slice(0, 18)}…</td>
                  <td>{r.taskTitle}</td>
                  <td>
                    <Badge>{r.status}</Badge>
                    {r.errorCode && (
                      <span className="muted" style={{ marginLeft: 6 }}>{r.errorCode}</span>
                    )}
                  </td>
                  <td>{r.receipt ? "✓ hash-chained" : <span className="muted">—</span>}</td>
                  <td className="muted" style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.summary ?? "—"}
                  </td>
                  <td className="muted">{r.finishedAt ? fmtTime(r.finishedAt) : "running…"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      {/* PHASE 10: pipeline stage reference — human-readable gate names */}
      <Panel title="Pipeline Stages">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(STAGE_LABELS).map(([key, label]) => (
            <span key={key} className="mono muted" style={{ fontSize: 12 }}>
              {label} <span style={{ opacity: 0.4 }}>({key})</span>
            </span>
          ))}
        </div>
      </Panel>
    </>
  );
}
