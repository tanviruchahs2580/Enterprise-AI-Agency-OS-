import { useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: string;
  model_policy: string;
  budget_usd: number;
  heartbeat_at: string | null;
}

export default function Agents() {
  const { data, loading, error } = useApi<{ items: Agent[] }>("/agents");

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  return (
    <>
      <h1>Agent Fleet</h1>
      <p className="subtitle">Specialist roster with per-agent tool contracts and budgets.</p>
      {(data?.items ?? []).length === 0 ? (
        <Empty what="agents seeded" />
      ) : (
        <div className="grid cols-2">
          {(data?.items ?? []).map((a) => {
            let tier = "STANDARD";
            try {
              tier = (JSON.parse(a.model_policy) as { tier?: string }).tier ?? tier;
            } catch { /* keep default */ }
            return (
              <Panel key={a.id} title={a.name}>
                <div className="row spread">
                  <Badge>{a.status}</Badge>
                  <span>
                    <Badge>{tier}</Badge> <Badge>{a.role}</Badge>
                  </span>
                </div>
                <p className="muted">{a.description}</p>
                <div className="muted" style={{ fontSize: 12 }}>
                  Budget cap ${a.budget_usd.toFixed(2)} · last heartbeat{" "}
                  {a.heartbeat_at ? fmtTime(a.heartbeat_at) : "never"}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </>
  );
}
