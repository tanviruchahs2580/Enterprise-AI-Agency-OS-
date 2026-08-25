import { api, useApi, useEventStream } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, Stat } from "../ui.tsx";

interface Ready {
  status: string;
  queueDeadLetters: number;
  sandboxProvider: string;
  features: Record<string, boolean>;
}
interface Costs {
  dailySpend: number;
  monthlySpend: number;
  byModel: { selected_model: string; total: number; calls: number }[];
}

export default function Overview() {
  const ready = useApi<Ready>("/ready");
  const costs = useApi<Costs>("/costs/summary");
  const agents = useApi<{ items: { id: string; status: string }[] }>("/agents");
  const projects = useApi<{ items: { id: string }[] }>("/projects");
  const firstProject = projects.data?.items[0]?.id ?? "";
  const tasks = useApi<{ items: { id: string; status: string }[] }>(
    firstProject ? `/tasks?projectId=${firstProject}&limit=200` : "/tasks?projectId=none"
  );
  const findings = useApi<{ items: { severity: string }[] }>("/security/findings");
  const events = useEventStream(true);

  if (ready.loading) return <Loading label="Connecting to control plane…" />;
  if (ready.error) return <ErrorBox message={`Control plane unreachable: ${ready.error}`} />;

  const agentBusy = (agents.data?.items ?? []).filter((a) => a.status === "busy").length;
  const activeTasks = (tasks.data?.items ?? []).filter((t) =>
    ["planned", "in_progress", "review", "qa"].includes(t.status)
  ).length;
  const openCritical = (findings.data?.items ?? []).length;

  return (
    <>
      <h1>Mission Control</h1>
      <p className="subtitle">
        Live agency status · sandbox: {ready.data?.sandboxProvider ?? "?"} ·{" "}
        <Badge>{ready.data?.status ?? "unknown"}</Badge>
      </p>

      <div className="grid cols-4">
        <Stat value={agentBusy} label="Agents busy" />
        <Stat value={activeTasks} label="Active tasks" />
        <Stat
          value={`$${(costs.data?.dailySpend ?? 0).toFixed(2)}`}
          label="Spend today"
        />
        <Stat
          value={openCritical}
          label="Open security findings"
          tone={openCritical > 0 ? "value" : ""}
        />
      </div>

      <h2>Fleet & spend</h2>
      <div className="grid cols-2">
        <Panel title="Model spend">
          {(costs.data?.byModel ?? []).length === 0 ? (
            <Empty what="model calls recorded" />
          ) : (
            <table>
              <thead>
                <tr><th>Model</th><th>Calls</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {(costs.data?.byModel ?? []).map((m) => (
                  <tr key={m.selected_model}>
                    <td className="mono">{m.selected_model}</td>
                    <td>{m.calls}</td>
                    <td>${m.total.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted" style={{ marginBottom: 0 }}>
            Monthly spend: ${(costs.data?.monthlySpend ?? 0).toFixed(2)}
          </p>
        </Panel>

        <Panel title="Live event stream">
          {events.length === 0 ? (
            <div className="empty">Waiting for domain events…</div>
          ) : (
            <div className="event-feed">
              {events.map((e) => (
                <div key={e.eventId}>
                  <Badge>{e.type}</Badge>{" "}
                  <span className="muted">{new Date(e.occurredAt).toLocaleTimeString()}</span>{" "}
                  <span className="mono">{JSON.stringify(e.payload).slice(0, 90)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <h2>Feature flags</h2>
      <div className="panel row">
        {Object.entries(ready.data?.features ?? {}).map(([k, v]) => (
          <span key={k}>
            <Badge>{v ? "enabled" : "disabled"}</Badge> <span className="muted">{k}</span>
          </span>
        ))}
      </div>

      <p style={{ marginTop: 20 }}>
        Queue dead letters:{" "}
        <strong>{ready.data?.queueDeadLetters ?? 0}</strong>
        {" · "}
        <a href="/api/v1/meta">API meta</a>
        {" · "}
        <button
          className="secondary small"
          onClick={() => void api("GET", "/audit/verify").then(() => undefined)}
        >
          Ping API
        </button>
      </p>
    </>
  );
}
