import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApiQuery, useEventStream } from "../components/useEventStream.ts";
import { api } from "../api.ts";
import { Card, Badge, StatCard, Skeleton, EmptyState } from "../components/ui.tsx";

interface Project { id: string; name: string; slug: string; description: string; status: string; created_at: string; }
interface Task { id: string; title: string; status: string; priority: number; assignee_agent_id: string | null; }
interface Run { executionId: string; taskId: string; taskTitle: string; status: string; summary: string | null; receipt: 0 | 1; finishedAt: string | null; }
interface Approval { id: string; action: string; resource_type: string; resource_id: string; reason: string; risk_level: string; status: string; created_at: string; }
interface AgentMember {
  paId: string; roleInProject: string; joinedAt: string;
  agentId: string; name: string; role: string; description: string; status: string;
  modelPolicy: string; budgetUsd: number; allowedTools: string; forbiddenTools: string;
  maxIterations: number; timeoutMs: number; heartbeatAt: string | null;
}
interface RosterAgent { id: string; name: string; role: string; status: string; }

type Tab = "overview" | "tasks" | "delivery" | "agents" | "approvals" | "knowledge";

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const project = useApiQuery<Project>("project-" + id, `/projects/${id}`);
  const tasks = useApiQuery<{ items: Task[] }>("ptasks-" + id, `/tasks?projectId=${id}&limit=200`);
  const members = useApiQuery<{ items: AgentMember[] }>("pagents-" + id, `/projects/${id}/agents`);
  const runsAll = useApiQuery<{ items: Run[] }>("pruns-" + id, `/delivery/runs?limit=200`);
  const taskIds = new Set((tasks.data?.items ?? []).map((t) => t.id));
  const runs = { ...runsAll, data: runsAll.data ? { items: runsAll.data.items.filter((r) => taskIds.has(r.taskId)) } : undefined };
  const approvalsAll = useApiQuery<{ items: Approval[] }>("papprovals-" + id, `/approvals/pending?limit=100`);
  const approvals = { ...approvalsAll, data: approvalsAll.data ? { items: approvalsAll.data.items.filter((a) => a.resource_id === id) } : undefined };

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "tasks", label: "Tasks", count: tasks.data?.items.length },
    { key: "delivery", label: "Delivery", count: runs.data?.items.length },
    { key: "agents", label: "Agents", count: members.data?.items.length },
    { key: "approvals", label: "Approvals", count: approvals.data?.items.length },
    { key: "knowledge", label: "Knowledge" },
  ];

  return (
    <div className="space-y-5">
      {project.isLoading ? <Skeleton className="h-24" /> : project.isError ? (
        <Card><div className="text-err">{(project.error as Error).message}</div></Card>
      ) : (
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <button onClick={() => history.back()} className="text-xs text-text-dim hover:text-text mb-2">← Projects</button>
            <h1 className="text-2xl font-bold tracking-tight">{project.data?.name}</h1>
            <p className="text-sm text-text-dim">{project.data?.description}</p>
            <p className="text-xs text-text-faint font-mono mt-1">{project.data?.slug} · created {project.data?.created_at ? new Date(project.data.created_at).toLocaleDateString() : "—"}</p>
          </div>
          <Badge tone={project.data?.status}>{project.data?.status}</Badge>
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap ${tab === t.key ? "text-text border-b-2 border-accent" : "text-text-dim hover:text-text"}`}
          >
            {t.label}{typeof t.count === "number" ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab project={project.data} tasks={tasks.data?.items ?? []} runs={runs.data?.items ?? []} approvals={approvals.data?.items ?? []} />}
      {tab === "tasks" && <TasksTab items={tasks.data?.items ?? []} loading={tasks.isLoading} error={tasks.error} />}
      {tab === "delivery" && <DeliveryTab items={runs.data?.items ?? []} loading={runs.isLoading} error={runs.error} />}
      {tab === "agents" && <AgentTeamTab projectId={id} taskIds={taskIds} />}
      {tab === "approvals" && <ApprovalsTab items={approvals.data?.items ?? []} loading={approvals.isLoading} error={approvals.error} />}
      {tab === "knowledge" && <KnowledgeTab projectId={id} />}
    </div>
  );
}

function OverviewTab({ project, tasks, runs, approvals }: { project?: Project; tasks: Task[]; runs: Run[]; approvals: Approval[] }) {
  const open = tasks.filter((t) => t.status !== "completed").length;
  const succeeded = runs.filter((r) => r.status === "succeeded").length;
  const pending = approvals.filter((a) => a.status === "pending").length;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard value={tasks.length} label="Total tasks" />
      <StatCard value={open} label="Open tasks" tone="accent" />
      <StatCard value={`${succeeded}/${runs.length}`} label="Delivery succeeded" tone={succeeded ? "ok" : "warn"} />
      <StatCard value={pending} label="Pending approvals" tone={pending ? "warn" : "ok"} />
      <div className="lg:col-span-4">
        <Card title="Description">
          <p className="text-sm text-text-dim">{project?.description || "No description provided."}</p>
        </Card>
      </div>
    </div>
  );
}

function TasksTab({ items, loading, error }: { items: Task[]; loading: boolean; error: unknown }) {
  if (loading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-16"/>)}</div>;
  if (error) return <Card><div className="text-err">{(error as Error).message}</div></Card>;
  if (!items.length) return <EmptyState title="No tasks yet" hint="Add tasks from the Tasks page to start the SDLC." />;
  return (
    <div className="divide-y divide-border border border-border rounded-lg bg-bg-panel">
      {items.map((t) => (
        <div key={t.id} className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="font-medium">{t.title}</div>
            <div className="text-xs text-text-faint">P{t.priority} · {t.assignee_agent_id ? "assigned" : "unassigned"}</div>
          </div>
          <Badge tone={t.status}>{t.status}</Badge>
        </div>
      ))}
    </div>
  );
}

function DeliveryTab({ items, loading, error }: { items: Run[]; loading: boolean; error: unknown }) {
  if (loading) return <Skeleton className="h-32" />;
  if (error) return <Card><div className="text-err">{(error as Error).message}</div></Card>;
  if (!items.length) return <EmptyState title="No delivery runs" hint="Dispatch a delivery task to begin an autonomous run." />;
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-text-dim border-b border-border">
            <th className="py-2 pr-3">Execution</th><th className="py-2 pr-3">Task</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Receipt</th><th className="py-2">Finished</th>
          </tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.executionId} className="border-b border-border">
                <td className="py-2 pr-3 font-mono text-text-faint">{r.executionId.slice(0,18)}…</td>
                <td className="py-2 pr-3">{r.taskTitle}</td>
                <td className="py-2 pr-3"><Badge tone={r.status==="succeeded"?"ok":"accent"}>{r.status}</Badge></td>
                <td className="py-2 pr-3">{r.receipt ? "✓ hash-chained" : "—"}</td>
                <td className="py-2 text-text-faint">{r.finishedAt ? new Date(r.finishedAt).toLocaleString() : "running…"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AgentTeamTab({ projectId, taskIds }: { projectId: string; taskIds: Set<string> }) {
  const members = useApiQuery<{ items: AgentMember[] }>("pagents-" + projectId, `/projects/${projectId}/agents`);
  const roster = useApiQuery<{ items: RosterAgent[] }>("agents", "/agents");
  const events = useEventStream(true, 80);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const memberIds = new Set((members.data?.items ?? []).map((m) => m.agentId));
  const available = (roster.data?.items ?? []).filter((a) => !memberIds.has(a.id));

  async function addAgent() {
    if (!selected) return;
    setBusy(true); setMsg(null);
    try {
      await api("POST", `/projects/${projectId}/agents`, { agentId: selected, roleInProject: "member" });
      setSelected(""); setAdding(false);
      await members.refetch();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAgent(agentId: string) {
    setBusy(true); setMsg(null);
    try {
      await api("DELETE", `/projects/${projectId}/agents/${agentId}`);
      await members.refetch();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const live = events.filter((e) => {
    const p = e.payload as { taskId?: string; projectId?: string };
    return (p.taskId && taskIds.has(p.taskId)) || p.projectId === projectId;
  }).slice(0, 25);

  if (members.isLoading) return <Skeleton className="h-44" />;
  if (members.isError) return <Card><div className="text-err">{(members.error as Error).message}</div></Card>;

  const items = members.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Project Agents</h2>
          <p className="text-sm text-text-dim">Which specialists are working on — or assigned to — this project. Live activity is monitored below.</p>
        </div>
        <button
          disabled={busy || available.length === 0}
          onClick={() => setAdding((v) => !v)}
          className="bg-accent text-white rounded-md px-3 py-2 text-sm disabled:opacity-40"
        >
          {adding ? "Cancel" : "+ Add agent to project"}
        </button>
      </div>

      {msg && <Card><div className="text-err">{msg}</div></Card>}
      {adding && (
        <Card>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs uppercase tracking-wider text-text-dim">Available agent</label>
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 w-full bg-bg-input border border-border rounded-md px-3 py-2 text-sm text-text">
                <option value="">Select an agent…</option>
                {available.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
              </select>
            </div>
            <button disabled={busy || !selected} onClick={addAgent} className="bg-accent text-white rounded-md px-4 py-2 text-sm disabled:opacity-40">
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
          {available.length === 0 && <p className="text-xs text-text-faint mt-2">All seeded agents are already on this project.</p>}
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState title="No agents assigned" hint="Add an agent based on the project's current state to staff this work." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((m) => (
            <Card key={m.paId}>
              <div className="flex items-center justify-between mb-2">
                <Badge tone={m.status === "busy" ? "accent" : "ok"}>{m.status}</Badge>
                <Badge tone="accent">{m.roleInProject}</Badge>
              </div>
              <div className="font-semibold">{m.name}</div>
              <p className="text-xs text-text-faint mt-0.5">{m.role} · {m.modelPolicy}</p>
              <p className="text-sm text-text-dim mt-1 line-clamp-2">{m.description}</p>
              <div className="text-xs text-text-faint mt-3">Budget ${m.budgetUsd.toFixed(2)} · max {m.maxIterations} iters · {(m.timeoutMs / 1000).toFixed(0)}s · joined {new Date(m.joinedAt).toLocaleDateString()}</div>
              <button onClick={() => removeAgent(m.agentId)} disabled={busy} className="mt-2 text-xs text-err hover:underline disabled:opacity-40">Remove from project</button>
            </Card>
          ))}
        </div>
      )}

      <Card title="Live activity monitor">
        <p className="text-xs text-text-dim mb-2">Real-time events for this project's tasks (via SSE).</p>
        {live.length === 0 ? (
          <p className="text-sm text-text-faint">No live activity yet. Trigger a delivery run or create tasks to see agents work in real time.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {live.map((e, i) => (
              <div key={i} className="flex items-center gap-3 text-sm border-b border-border pb-2">
                <span className="font-mono text-text-faint text-xs">{new Date(e.occurredAt).toLocaleTimeString()}</span>
                <Badge tone="accent">{e.type}</Badge>
                <span className="text-text">{e.label ?? ""}</span>
                {e.actorId && <span className="text-xs text-text-faint">· {e.actorId}</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ApprovalsTab({ items, loading, error }: { items: Approval[]; loading: boolean; error: unknown }) {
  if (loading) return <Skeleton className="h-32" />;
  if (error) return <Card><div className="text-err">{(error as Error).message}</div></Card>;
  if (!items.length) return <EmptyState title="No approvals for this project" />;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {items.map((a) => (
        <Card key={a.id}>
          <div className="flex items-center justify-between mb-2">
            <Badge tone={a.risk_level==="critical"?"crit":a.risk_level==="high"?"err":"warn"}>{a.risk_level}</Badge>
            <Badge tone={a.status==="approved"?"ok":a.status==="rejected"?"err":"warn"}>{a.status}</Badge>
          </div>
          <div className="font-semibold">{a.action}</div>
          <p className="text-sm text-text-dim mt-1">{a.reason}</p>
        </Card>
      ))}
    </div>
  );
}

function KnowledgeTab({ projectId }: { projectId: string }) {
  const docs = useApiQuery<{ items: { id: string; title: string; kind: string; content: string }[] }>(
    "pknowledge-" + projectId, `/knowledge/search?q=${encodeURIComponent(projectId)}`
  );
  if (docs.isLoading) return <Skeleton className="h-24" />;
  if (!docs.data?.items.length) return <EmptyState title="No linked knowledge" hint="Knowledge captured during delivery will appear here." />;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {docs.data.items.map((d) => (
        <Card key={d.id}>
          <div className="text-[11px] uppercase tracking-wider text-text-dim">{d.kind}</div>
          <div className="font-semibold mt-1">{d.title}</div>
          <p className="text-sm text-text-dim mt-1 line-clamp-2">{d.content.slice(0,160)}</p>
        </Card>
      ))}
    </div>
  );
}
