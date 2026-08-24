import { useState } from "react";
import { api, useApi } from "../api.ts";
import { Empty, ErrorBox, Loading, Panel } from "../ui.tsx";

interface Task {
  id: string;
  project_id: string;
  title: string;
  status: string;
  priority: number;
  assignee_agent_id: string | null;
  created_at: string;
}

const LANES = ["draft", "ready", "planned", "in_progress", "review", "qa", "security", "completed"];

export default function Tasks() {
  const projects = useApi<{ items: { id: string; name: string }[] }>("/projects");
  const [projectId, setProjectId] = useState("");
  const activeProject = projectId || projects.data?.items[0]?.id || "";
  const tasks = useApi<{ items: Task[] }>(
    activeProject ? `/tasks?projectId=${activeProject}&limit=200` : "/tasks?projectId=-"
  );

  if (projects.loading) return <Loading />;
  if (projects.error) return <ErrorBox message={projects.error} />;

  return (
    <>
      <h1>Task Board</h1>
      <p className="subtitle">
        Dependency-aware kanban. Only tasks whose dependencies are completed appear in the ready queue.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <label htmlFor="proj-select" className="muted">Project</label>
        <select
          id="proj-select"
          value={activeProject}
          onChange={(e) => setProjectId(e.target.value)}
        >
          {(projects.data?.items ?? []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          className="secondary small"
          onClick={() =>
            void api("GET", `/projects/${activeProject}/tasks/ready`).then((r) => {
              const items = (r as { items?: unknown[] }).items ?? [];
              alert(
                items.length === 0
                  ? "Ready queue is empty."
                  : `Ready to dispatch:\n\n${items.map((t) => `- ${(t as { title: string }).title}`).join("\n")}`
              );
            })
          }
        >
          Show ready queue
        </button>
      </div>

      {tasks.loading ? (
        <Loading />
      ) : tasks.error ? (
        <ErrorBox message={tasks.error} />
      ) : (tasks.data?.items ?? []).length === 0 ? (
        <Empty what="tasks for this project" />
      ) : (
        <div className="kanban">
          {LANES.map((lane) => {
            const cards = (tasks.data?.items ?? []).filter((t) => t.status === lane);
            return (
              <div key={lane} className="kanban-col">
                <h4>{lane.replace(/_/g, " ")} ({cards.length})</h4>
                {cards.map((t) => (
                  <div key={t.id} className="kanban-card">
                    <strong>{t.title}</strong>
                    <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                      P{t.priority} · {t.assignee_agent_id ? "assigned" : "unassigned"}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <h2>Dispatch</h2>
      <Panel title="Send a task to an agent">
        <p className="muted">
          Dispatching creates an execution record and enqueues a background job.
          The assigned agent produces its work through the model router with
          budget enforcement and full audit trail.
        </p>
        <DispatchForm projectId={activeProject} onDone={tasks.reload} />
      </Panel>
    </>
  );
}

function DispatchForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const agents = useApi<{ items: { id: string; name: string; role: string }[] }>("/agents");
  const tasks = useApi<{ items: Task[] }>(`/tasks?projectId=${projectId}&status=ready&limit=50`);
  const [taskId, setTaskId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <>
      <div className="row">
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)} aria-label="Task">
          <option value="">Select task…</option>
          {(tasks.data?.items ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent">
          <option value="">Select agent…</option>
          {(agents.data?.items ?? []).map((a) => (
            <option key={a.id} value={a.id}>{a.name} ({a.role})</option>
          ))}
        </select>
        <button
          disabled={!taskId || !agentId}
          onClick={() => {
            setMsg(null);
            api("POST", "/executions", { taskId, agentId })
              .then(() => {
                setMsg("Execution queued.");
                onDone();
              })
              .catch((e: Error) => setMsg(`Failed: ${e.message}`));
          }}
        >
          Dispatch
        </button>
      </div>
      {msg && <p className={msg.startsWith("Failed") ? "error-box" : ""}>{msg}</p>}
    </>
  );
}
