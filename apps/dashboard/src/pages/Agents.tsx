import { useState, type ReactNode } from "react";
import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface Agent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: string;
  model_policy: string;
  budget_usd: number;
  allowed_tools: string;
  forbidden_tools: string;
  max_iterations: number;
  timeout_ms: number;
  heartbeat_at: string | null;
}

function parseCsv(s: string | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.map(String) : String(v).split(",").map((x) => x.trim());
  } catch {
    return String(s).split(",").map((x) => x.trim()).filter(Boolean);
  }
}

function tierOf(policy: string): string {
  try { return (JSON.parse(policy) as { tier?: string }).tier ?? "STANDARD"; } catch { return "STANDARD"; }
}

export default function Agents() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ items: Agent[] }>("agents", "/agents");
  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-44"/>)}</div>;
  if (isError) return <Card><div className="text-err">{(error as Error).message}</div><button className="mt-3 bg-accent text-white rounded-md px-3 py-2 text-sm" onClick={()=>refetch()}>Retry</button></Card>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Fleet</h1>
        <p className="text-sm text-text-dim">Specialist roster with per-agent tool contracts, model tier and budgets.</p>
      </div>
      {(data?.items ?? []).length === 0 ? (
        <EmptyState title="No agents seeded" hint="The roster is populated on first boot via the seed script." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(data?.items ?? []).map((a) => (
            <AgentCard key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AgentCard({ a }: { a: Agent }) {
  const [open, setOpen] = useState(false);
  const tier = tierOf(a.model_policy);
  const allowed = parseCsv(a.allowed_tools);
  const forbidden = parseCsv(a.forbidden_tools);
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <Badge tone={a.status === "busy" ? "accent" : "ok"}>{a.status}</Badge>
        <div className="flex gap-1.5">
          <Badge tone="accent">{tier}</Badge>
          <Badge>{a.role}</Badge>
        </div>
      </div>
      <div className="font-semibold">{a.name}</div>
      <p className="text-sm text-text-dim mt-1 line-clamp-2">{a.description}</p>
      <div className="text-xs text-text-faint mt-3">Budget cap ${a.budget_usd.toFixed(2)} · last heartbeat {a.heartbeat_at ? new Date(a.heartbeat_at).toLocaleString() : "never"}</div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-xs text-accent hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide details" : "Show details"}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm border-t border-border pt-3">
          <Field label="Agent ID" value={<span className="font-mono text-text-faint">{a.id}</span>} />
          <Field label="Role" value={a.role} />
          <Field label="Model tier" value={tier} />
          <Field label="Budget cap" value={`$${a.budget_usd.toFixed(2)}`} />
          <Field label="Max iterations" value={String(a.max_iterations)} />
          <Field label="Timeout" value={`${(a.timeout_ms / 1000).toFixed(0)}s`} />
          <Field label="Allowed tools" value={allowed.length ? <div className="flex flex-wrap gap-1">{allowed.map((t) => <Badge key={t}>{t}</Badge>)}</div> : <span className="text-text-faint">—</span>} />
          <Field label="Forbidden tools" value={forbidden.length ? <div className="flex flex-wrap gap-1">{forbidden.map((t) => <Badge key={t} tone="err">{t}</Badge>)}</div> : <span className="text-text-faint">—</span>} />
        </div>
      )}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs uppercase tracking-wider text-text-dim col-span-1">{label}</div>
      <div className="col-span-2 text-text">{value}</div>
    </div>
  );
}
