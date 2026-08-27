import { useEffect, useState } from "react";
import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface DeliveryRun { executionId: string; taskId: string; taskTitle: string; status: string; traceId: string; summary: string | null; errorCode: string | null; receipt: 0 | 1; createdAt: string; finishedAt: string | null; }

const STAGES = [
  "worktree_created","code_generated","static_analysis","fault_injected","tests_run","repair_attempted",
  "contract_verified","benchmark_run","docs_generated","review_completed","committed","merged",
  "converged","postmerge_verified","postmerge_reverted",
];

export default function Delivery() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ items: DeliveryRun[] }>("delivery", "/delivery/runs?limit=100");
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(()=>setTick((t)=>t+1), 5000); return ()=>clearInterval(id); }, []);
  useEffect(() => { if (tick>0) refetch(); }, [tick]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Autonomous Delivery</h1>
        <p className="text-sm text-text-dim">Requirement → worktree → codegen → static analysis → tests → self-heal → contract → benchmark → docs → review → merge → post-merge. Auto-refreshes every 5s.</p>
      </div>

      <div className="flex items-center gap-3">
        <button className="bg-bg-hover text-text border border-border rounded-md px-3 py-2 text-sm" onClick={()=>refetch()}>Refresh now</button>
        {data && <span className="text-sm text-text-dim">{data.items.filter(r=>r.status==="succeeded").length} succeeded · {data.items.filter(r=>r.status!=="succeeded").length} other</span>}
      </div>

      {isLoading ? <Skeleton className="h-40" /> : isError ? (
        <Card><div className="text-err">{(error as Error).message}</div></Card>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="No delivery runs yet" hint="Dispatch a ready delivery task from the Tasks page to start an autonomous run." />
      ) : (
        <Card title={`Runs (${data?.items.length ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-text-dim border-b border-border">
                <th className="py-2 pr-3">Execution</th><th className="py-2 pr-3">Task</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Receipt</th><th className="py-2 pr-3">Summary</th><th className="py-2">Finished</th>
              </tr></thead>
              <tbody>
                {(data?.items ?? []).map((r)=>(
                  <tr key={r.executionId} className="border-b border-border">
                    <td className="py-2 pr-3 font-mono text-text-faint">{r.executionId.slice(0,18)}…</td>
                    <td className="py-2 pr-3">{r.taskTitle}</td>
                    <td className="py-2 pr-3"><Badge tone={r.status==="succeeded"?"ok":"accent"}>{r.status}</Badge>{r.errorCode && <span className="text-xs text-text-faint ml-2">{r.errorCode}</span>}</td>
                    <td className="py-2 pr-3">{r.receipt ? <span className="text-ok">✓ hash-chained</span> : <span className="text-text-faint">—</span>}</td>
                    <td className="py-2 pr-3 text-text-dim max-w-xs truncate">{r.summary ?? "—"}</td>
                    <td className="py-2 text-text-faint">{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : "running…"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Pipeline Stages">
        <div className="flex flex-wrap gap-2">
          {STAGES.map((s)=>(
            <span key={s} className="text-xs font-mono text-text-faint bg-bg-hover border border-border rounded-full px-2.5 py-1">{s.replace(/_/g," ")}</span>
          ))}
        </div>
      </Card>
    </div>
  );
}
