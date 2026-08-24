import { useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtUsd } from "../ui.tsx";

interface ModelRow {
  provider: string;
  providerKind: string;
  alias: string;
  modelId: string;
  tier: string;
  capabilities: string[];
  contextWindow: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
}
interface Costs {
  dailySpend: number;
  monthlySpend: number;
  byModel: { selected_model: string; total: number; calls: number }[];
  budgets: { scope_type: string; scope_id: string; limit_usd: number; action: string }[];
}

export default function Models() {
  const models = useApi<{ models: ModelRow[] }>("/models");
  const costs = useApi<Costs>("/costs/summary");

  if (models.loading) return <Loading />;
  if (models.error) return <ErrorBox message={models.error} />;

  return (
    <>
      <h1>Models & Cost Governance</h1>
      <p className="subtitle">
        Routing tiers, health and spend. Fallbacks are always recorded — never silent.
      </p>

      <Panel title="Registered models">
        {(models.data?.models ?? []).length === 0 ? (
          <Empty what="models" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Alias</th><th>Tier</th><th>Provider</th><th>Context</th>
                <th>In $/1k</th><th>Out $/1k</th><th>Capabilities</th>
              </tr>
            </thead>
            <tbody>
              {(models.data?.models ?? []).map((m) => (
                <tr key={`${m.provider}-${m.alias}`}>
                  <td className="mono">{m.alias}</td>
                  <td><Badge>{m.tier}</Badge></td>
                  <td className="muted">{m.provider} ({m.providerKind})</td>
                  <td>{(m.contextWindow / 1000).toFixed(0)}k</td>
                  <td>{fmtUsd(m.inputCostPer1k)}</td>
                  <td>{fmtUsd(m.outputCostPer1k)}</td>
                  <td className="muted">{m.capabilities.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <h2>Spend summary</h2>
      {costs.error ? (
        <ErrorBox message={costs.error} />
      ) : (
        <div className="grid cols-2">
          <Panel title="By model">
            {(costs.data?.byModel ?? []).length === 0 ? (
              <Empty what="recorded model requests" />
            ) : (
              <table>
                <thead><tr><th>Model</th><th>Calls</th><th>Total</th></tr></thead>
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
          </Panel>
          <Panel title="Active budget guards">
            <p className="muted">
              Daily ${costs.data?.dailySpend.toFixed(2) ?? "0.00"} · Monthly $
              {costs.data?.monthlySpend.toFixed(2) ?? "0.00"}
            </p>
            {(costs.data?.budgets ?? []).length === 0 ? (
              <Empty what="budgets configured" />
            ) : (
              <table>
                <thead><tr><th>Scope</th><th>Limit</th><th>Action</th></tr></thead>
                <tbody>
                  {(costs.data?.budgets ?? []).map((b) => (
                    <tr key={`${b.scope_type}:${b.scope_id}`}>
                      <td>{b.scope_type}:{b.scope_id === "*" ? "all" : b.scope_id.slice(0, 12)}</td>
                      <td>${b.limit_usd.toFixed(2)}</td>
                      <td><Badge>{b.action}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
