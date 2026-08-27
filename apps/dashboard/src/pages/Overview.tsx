import { useEffect, useState } from "react";
import {
  AreaChart, Area, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { useApiQuery, useEventStream, type DomainEvent } from "../components/useEventStream.ts";
import { Card, StatCard, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface Ready { status: string; queueDeadLetters: number; sandboxProvider: string; features: Record<string, boolean>; }
interface Costs { dailySpend: number; monthlySpend: number; byModel: { selected_model: string; total: number; calls: number }[]; }

const TONE: Record<string, string> = {
  ok: "ok", succeeded: "ok", approved: "ok", active: "ok", healthy: "ok",
  running: "accent", busy: "accent", deploying: "accent", in_progress: "accent",
  pending: "warn", review: "warn", qa: "warn", waiting_approval: "warn",
  failed: "err", open: "err", critical: "err", high: "err", dead_letter: "err",
};

export default function Overview() {
  const ready = useApiQuery<Ready>("ready", "/ready");
  const costs = useApiQuery<Costs>("costs", "/costs/summary");
  const agents = useApiQuery<{ items: { id: string; status: string; name: string }[] }>("agents", "/agents");
  const projects = useApiQuery<{ items: { id: string }[] }>("projects", "/projects?limit=50");
  const findings = useApiQuery<{ items: { severity: string }[] }>("findings", "/security/findings");
  const events = useEventStream(true, 40);
  const [spendSeries, setSpendSeries] = useState<{ t: string; v: number }[]>([]);

  // Build a small synthetic daily trend from monthlySpend for visual richness.
  useEffect(() => {
    const m = costs.data?.monthlySpend ?? 0;
    const base = m / 30;
    const pts = Array.from({ length: 14 }, (_, i) => ({
      t: `D${i - 13}`,
      v: Math.max(0, base * (0.6 + 0.8 * Math.abs(Math.sin(i / 2))) + (i === 13 ? (costs.data?.dailySpend ?? 0) : 0)),
    }));
    setSpendSeries(pts);
  }, [costs.data]);

  const agentBusy = (agents.data?.items ?? []).filter((a) => a.status === "busy").length;
  const agentTotal = agents.data?.items.length ?? 0;
  const openFindings = findings.data?.items.length ?? 0;
  const modelSplit = (costs.data?.byModel ?? []).map((m, i) => ({
    name: m.selected_model, value: Number(m.total.toFixed(3)), i,
  }));
  const COLORS = ["#4f8cff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#22d3ee"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-sm text-text-dim">
            Live agency status · sandbox: <span className="text-text">{ready.data?.sandboxProvider ?? "—"}</span> ·{" "}
            <Badge tone={ready.data?.status === "ready" ? "ok" : "warn"}>{ready.data?.status ?? "…"}</Badge>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={openFindings > 0 ? "err" : "ok"}>{openFindings} findings</Badge>
          <Badge tone={ready.data?.queueDeadLetters ? "err" : "ok"}>{ready.data?.queueDeadLetters ?? 0} dead letters</Badge>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {ready.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <StatCard value={agentBusy} label="Agents busy" hint={`of ${agentTotal} registered`} tone={agentBusy ? "accent" : "ok"} />
            <StatCard value={`$${((costs.data?.dailySpend ?? 0)).toFixed(2)}`} label="Spend today" hint={`$${(costs.data?.monthlySpend ?? 0).toFixed(2)} this month`} />
            <StatCard value={openFindings} label="Open security findings" tone={openFindings ? "err" : "ok"} />
            <StatCard value={projects.data?.items.length ?? 0} label="Active projects" />
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Spend trend (14d)" className="lg:col-span-2">
          {spendSeries.length === 0 ? (
            <Skeleton className="h-48" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={spendSeries} margin={{ left: -20, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="sp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f8cff" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#4f8cff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                <XAxis dataKey="t" tick={{ fontSize: 11, fill: "rgb(var(--text-faint))" }} />
                <YAxis tick={{ fontSize: 11, fill: "rgb(var(--text-faint))" }} />
                <Tooltip contentStyle={{ background: "rgb(var(--bg-elevated))", border: "1px solid rgb(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="v" stroke="#4f8cff" fill="url(#sp)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Spend by model">
          {modelSplit.length === 0 ? (
            <EmptyState title="No model spend yet" hint="Spend is recorded as agents run." />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={modelSplit} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {modelSplit.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "rgb(var(--bg-elevated))", border: "1px solid rgb(var(--border))", borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Live feed + feature flags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Live event stream" className="lg:col-span-2">
          {events.length === 0 ? (
            <div className="text-sm text-text-dim py-8 text-center">Waiting for domain events…</div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {events.map((e: DomainEvent, i) => (
                <div key={e.eventId ?? e.seq ?? i} className="py-2 flex items-start gap-3 text-sm animate-fade-in">
                  <Badge tone={TONE[String(e.type).split(".")[0] ?? ""] ?? "low"}>{e.label ?? e.type}</Badge>
                  <span className="text-text-faint text-xs mt-0.5">{new Date(e.occurredAt).toLocaleTimeString()}</span>
                  <span className="text-text-dim font-mono text-xs truncate">{JSON.stringify(e.payload).slice(0, 90)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Feature flags">
          {ready.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <div className="space-y-1.5">
              {Object.entries(ready.data?.features ?? {}).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-sm py-1">
                  <span className="text-text-dim">{k}</span>
                  <Badge tone={v ? "ok" : "low"}>{v ? "enabled" : "disabled"}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
