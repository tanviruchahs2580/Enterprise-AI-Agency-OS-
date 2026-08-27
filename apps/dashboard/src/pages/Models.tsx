import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, StatCard, Skeleton, EmptyState } from "../components/ui.tsx";

interface ModelRow { provider: string; providerKind: string; alias: string; modelId: string; tier: string; capabilities: string[]; contextWindow: number; inputCostPer1k: number; outputCostPer1k: number; }
interface Costs { dailySpend: number; monthlySpend: number; byModel: { selected_model: string; total: number; calls: number }[]; budgets: { scope_type: string; scope_id: string; limit_usd: number; action: string }[]; }

export default function Models() {
  const models = useApiQuery<{ models: ModelRow[] }>("models", "/models");
  const costs = useApiQuery<Costs>("costs", "/costs/summary");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Models & Cost Governance</h1>
        <p className="text-sm text-text-dim">Routing tiers, health and spend. Fallbacks are always recorded — never silent.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard value={`$${(costs.data?.dailySpend ?? 0).toFixed(2)}`} label="Spend today" />
        <StatCard value={`$${(costs.data?.monthlySpend ?? 0).toFixed(2)}`} label="Spend this month" />
        <StatCard value={models.data?.models.length ?? 0} label="Registered models" />
        <StatCard value={costs.data?.budgets.length ?? 0} label="Active budget guards" tone="accent" />
      </div>

      <Card title="Registered models">
        {models.isLoading ? <Skeleton className="h-40" /> : (models.data?.models ?? []).length === 0 ? (
          <EmptyState title="No models registered" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-text-dim border-b border-border">
                <th className="py-2 pr-3">Alias</th><th className="py-2 pr-3">Tier</th><th className="py-2 pr-3">Provider</th><th className="py-2 pr-3">Context</th><th className="py-2 pr-3">In $/1k</th><th className="py-2 pr-3">Out $/1k</th><th className="py-2">Capabilities</th>
              </tr></thead>
              <tbody>
                {(models.data?.models ?? []).map((m)=>(
                  <tr key={`${m.provider}-${m.alias}`} className="border-b border-border">
                    <td className="py-2 pr-3 font-mono">{m.alias}</td>
                    <td className="py-2 pr-3"><Badge tone="accent">{m.tier}</Badge></td>
                    <td className="py-2 pr-3 text-text-dim">{m.provider} ({m.providerKind})</td>
                    <td className="py-2 pr-3 text-text-dim">{(m.contextWindow/1000).toFixed(0)}k</td>
                    <td className="py-2 pr-3 text-text-dim">${m.inputCostPer1k.toFixed(4)}</td>
                    <td className="py-2 pr-3 text-text-dim">${m.outputCostPer1k.toFixed(4)}</td>
                    <td className="py-2 text-text-faint">{m.capabilities.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Spend by model">
          {costs.isLoading ? <Skeleton className="h-32" /> : (costs.data?.byModel ?? []).length === 0 ? (
            <EmptyState title="No recorded model requests" />
          ) : (
            <div className="space-y-2">
              {(costs.data?.byModel ?? []).map((m)=>(
                <div key={m.selected_model} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-text-dim">{m.selected_model}</span>
                  <span><span className="text-text-faint mr-3">{m.calls} calls</span><span className="text-text">${m.total.toFixed(4)}</span></span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Budget guards">
          {(costs.data?.budgets ?? []).length === 0 ? (
            <EmptyState title="No budgets configured" />
          ) : (
            <div className="space-y-2">
              {(costs.data?.budgets ?? []).map((b)=>(
                <div key={`${b.scope_type}:${b.scope_id}`} className="flex items-center justify-between text-sm">
                  <span className="text-text-dim">{b.scope_type}:{b.scope_id === "*" ? "all" : b.scope_id.slice(0,12)}</span>
                  <span><span className="text-text-faint mr-3">${b.limit_usd.toFixed(2)}</span><Badge>{b.action}</Badge></span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
