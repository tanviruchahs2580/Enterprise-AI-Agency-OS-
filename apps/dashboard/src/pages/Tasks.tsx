import { useState } from "react";
import { api } from "../api.ts";
import { useApiQuery } from "../components/useEventStream.ts";
import { useToast } from "../components/Toast.tsx";
import { Card, Button, Skeleton, EmptyState } from "../components/ui.tsx";

interface Task { id: string; project_id: string; title: string; status: string; priority: number; assignee_agent_id: string | null; }
const LANES = ["draft", "ready", "planned", "in_progress", "review", "qa", "security", "completed"];

export default function Tasks() {
  const projects = useApiQuery<{ items: { id: string; name: string }[] }>("projects", "/projects?limit=100");
  const [projectId, setProjectId] = useState("");
  const active = projectId || projects.data?.items[0]?.id || "";
  const tasks = useApiQuery<{ items: Task[] }>("tasks", active ? `/tasks?projectId=${active}&limit=200` : "/tasks?projectId=none");
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [tbusy, setTbusy] = useState(false);

  async function createTask() {
    if (!title.trim() || !active) return;
    setTbusy(true);
    try {
      await api("POST", "/tasks", { projectId: active, title, description: "" });
      setTitle(""); toast.success("Task created"); tasks.refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setTbusy(false); }
  }

  if (projects.isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Task Board</h1>
        <p className="text-sm text-text-dim">Dependency-aware kanban. Only tasks whose dependencies are completed appear in the ready queue.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select value={active} onChange={(e)=>setProjectId(e.target.value)} className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-text">
          {(projects.data?.items ?? []).map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="New task title…" className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-text flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-accent/60" />
        <Button onClick={createTask} disabled={!title.trim() || tbusy}>{tbusy ? "Creating…" : "Add task"}</Button>
      </div>

      {tasks.isLoading ? (
        <Skeleton className="h-60" />
      ) : (tasks.data?.items ?? []).length === 0 ? (
        <EmptyState title="No tasks for this project" hint="Add a task above to start the SDLC." />
      ) : (
        <div className="grid grid-flow-col auto-cols-[minmax(170px,1fr)] gap-3 overflow-x-auto pb-2">
          {LANES.map((lane) => {
            const cards = (tasks.data?.items ?? []).filter((t)=>t.status === lane);
            return (
              <div key={lane} className="bg-bg-panel border border-border rounded-lg p-2 min-h-[160px]">
                <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2 px-1">{lane.replace(/_/g," ")} ({cards.length})</div>
                {cards.map((t)=>(
                  <div key={t.id} className="bg-bg-hover border border-border rounded-md p-2 mb-2 text-sm">
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[11px] text-text-faint mt-1">P{t.priority} · {t.assignee_agent_id ? "assigned" : "unassigned"}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <Card title="Dispatch a task to an agent">
        <DispatchForm projectId={active} onDone={()=>tasks.refetch()} />
      </Card>
    </div>
  );
}

function DispatchForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const agents = useApiQuery<{ items: { id: string; name: string; role: string }[] }>("agents", "/agents");
  const ready = useApiQuery<{ items: Task[] }>("ready-tasks", `/tasks?projectId=${projectId}&status=ready&limit=50`);
  const [taskId, setTaskId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [msg, setMsg] = useState<string|null>(null);
  const toast = useToast();

  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div>
        <label className="block text-xs text-text-dim mb-1">Task</label>
        <select value={taskId} onChange={(e)=>setTaskId(e.target.value)} className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-text min-w-[200px]">
          <option value="">Select ready task…</option>
          {(ready.data?.items ?? []).map((t)=><option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs text-text-dim mb-1">Agent</label>
        <select value={agentId} onChange={(e)=>setAgentId(e.target.value)} className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-text min-w-[200px]">
          <option value="">Select agent…</option>
          {(agents.data?.items ?? []).map((a)=><option key={a.id} value={a.id}>{a.name} ({a.role})</option>)}
        </select>
      </div>
      <Button onClick={()=>{
        setMsg(null);
        api("POST","/executions",{taskId,agentId}).then(()=>{setMsg("Execution queued.");toast.success("Execution queued");onDone();}).catch((e)=>{setMsg(`Failed: ${(e as Error).message}`);toast.error((e as Error).message);});
      }} disabled={!taskId || !agentId}>Dispatch</Button>
      {msg && <span className={msg.startsWith("Failed")?"text-err text-sm":"text-ok text-sm"}>{msg}</span>}
    </div>
  );
}
