import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface Agent { id: string; name: string; role: string; description: string; status: string; model_policy: string; budget_usd: number; heartbeat_at: string | null; }

export default function Agents() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ items: Agent[] }>("agents", "/agents");
  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-32"/>)}</div>;
  if (isError) return <Card><div className="text-err">{(error as Error).message}</div><button className="mt-3 bg-accent text-white rounded-md px-3 py-2 text-sm" onClick={()=>refetch()}>Retry</button></Card>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Agent Fleet</h1>
        <p className="text-sm text-text-dim">Specialist roster with per-agent tool contracts and budgets.</p>
      </div>
      {(data?.items ?? []).length === 0 ? (
        <EmptyState title="No agents seeded" hint="The roster is populated on first boot via the seed script." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {(data?.items ?? []).map((a) => {
            let tier = "STANDARD";
            try { tier = (JSON.parse(a.model_policy) as { tier?: string }).tier ?? tier; } catch {}
            return (
              <Card key={a.id}>
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
