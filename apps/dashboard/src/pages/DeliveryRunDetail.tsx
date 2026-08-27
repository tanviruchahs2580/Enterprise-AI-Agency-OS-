import { useParams, useNavigate } from "react-router-dom";
import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, StatCard, Skeleton, EmptyState } from "../components/ui.tsx";

interface Run {
  id: string; taskId: string; taskTitle: string; taskStatus: string; projectId: string; projectName: string;
  agentId: string; status: string; traceId: string; startedAt: string | null; finishedAt: string | null;
  summary: string | null; errorCode: string | null; tokensIn: number; tokensOut: number; costUsd: number;
  receipt: 0 | 1; createdAt: string;
}
interface Stage { name: string; index: number; state: "done" | "active" | "failed" | "pending" }

export default function DeliveryRunDetail() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const run = useApiQuery<{ execution: Run; stages: Stage[] }>("run-" + id, `/delivery/runs/${id}`);

  return (
    <div className="space-y-5">
      <button onClick={() => navigate("/delivery")} className="text-xs text-text-dim hover:text-text">← Delivery runs</button>

      {run.isLoading ? <Skeleton className="h-40" /> : run.isError ? (
        <Card><div className="text-err">{(run.error as Error).message}</div></Card>
      ) : !run.data ? <EmptyState title="Run not found" /> : (
        <RunView run={run.data.execution} stages={run.data.stages} onProject={(pid) => navigate(`/projects/${pid}`)} />
      )}
    </div>
  );
}

function RunView({ run, stages, onProject }: { run: Run; stages: Stage[]; onProject: (id: string) => void }) {
  const dur = run.startedAt && run.finishedAt
    ? Math.max(0, (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : null;
  return (
    <>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{run.taskTitle}</h1>
          <p className="text-sm text-text-dim">
            Execution <span className="font-mono text-text-faint">{run.id.slice(0, 18)}…</span> · agent {run.agentId}
          </p>
          <button className="text-xs text-accent hover:underline mt-1" onClick={() => onProject(run.projectId)}>
            {run.projectName} →
          </button>
        </div>
        <Badge tone={run.status === "succeeded" ? "ok" : run.status === "failed" ? "err" : "accent"}>{run.status}</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={`$${run.costUsd.toFixed(4)}`} label="Cost" />
        <StatCard value={`${(run.tokensIn + run.tokensOut).toLocaleString()}`} label="Tokens" />
        <StatCard value={dur != null ? `${dur.toFixed(0)}s` : "—"} label="Duration" />
        <StatCard value={run.receipt ? "chained" : "none"} label="Quality receipt" tone={run.receipt ? "ok" : "warn"} />
      </div>

      <Card title="Autonomous delivery pipeline">
        <ol className="space-y-1.5">
          {stages.map((s) => (
            <li key={s.index} className="flex items-center gap-3 text-sm">
              <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[11px] ${s.state === "done" ? "bg-ok/20 text-ok" : s.state === "failed" ? "bg-err/20 text-err" : s.state === "active" ? "bg-accent/20 text-accent animate-pulse" : "bg-bg-hover text-text-faint"}`}>
                {s.index}
              </span>
              <span className={s.state === "pending" ? "text-text-faint" : "text-text"}>{s.name.replace(/_/g, " ")}</span>
              {s.state === "failed" && <Badge tone="err">failed</Badge>}
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-text-faint mt-3">
          Per-stage events are emitted during the run; only the terminal outcome is persisted. Stage-level persistence is a tracked roadmap item.
        </p>
      </Card>

      <Card title="Result">
        {run.errorCode && <div className="text-sm text-err mb-2">error_code: {run.errorCode}</div>}
        <p className="text-sm text-text-dim whitespace-pre-wrap">{run.summary ?? "No summary recorded."}</p>
        <div className="text-xs text-text-faint mt-3 font-mono">trace: {run.traceId}</div>
        <div className="text-xs text-text-faint mt-1">created {new Date(run.createdAt).toLocaleString()}</div>
      </Card>
    </>
  );
}
