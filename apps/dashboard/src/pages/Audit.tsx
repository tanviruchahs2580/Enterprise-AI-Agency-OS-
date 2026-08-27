import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface AuditEntry { seq: number; type: string; actor_id: string; occurred_at: string; hash: string; prev_hash: string; tampered?: boolean; }

export default function Audit() {
  const { data, isLoading, isError, error } = useApiQuery<{ items: AuditEntry[]; verified?: boolean }>("audit", "/audit/events?limit=100");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-sm text-text-dim">Hash-chained, append-only. Each entry links to the previous; tampering breaks the chain.</p>
      </div>
      {isLoading ? <Skeleton className="h-40" /> : isError ? (
        <Card><div className="text-err">{(error as Error).message}</div></Card>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="No audit events" />
      ) : (
        <Card title={`Events (${data?.items.length ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-text-dim border-b border-border">
                <th className="py-2 pr-3">#</th><th className="py-2 pr-3">Type</th><th className="py-2 pr-3">Actor</th><th className="py-2 pr-3">When</th><th className="py-2">Hash</th>
              </tr></thead>
              <tbody>
                {(data?.items ?? []).map((e)=>(
                  <tr key={e.seq} className="border-b border-border">
                    <td className="py-2 pr-3 text-text-faint">{e.seq}</td>
                    <td className="py-2 pr-3"><Badge>{e.type}</Badge></td>
                    <td className="py-2 pr-3 text-text-dim">{e.actor_id}</td>
                    <td className="py-2 pr-3 text-text-faint">{new Date(e.occurred_at).toLocaleString()}</td>
                    <td className="py-2 font-mono text-[11px] text-text-faint">{e.hash.slice(0,16)}…</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
