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
        Requirement → worktree → codegen → tests → self-heal → review → merge.
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

      {loading && !items ? (        <Loading />
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
    </>
  );
}
