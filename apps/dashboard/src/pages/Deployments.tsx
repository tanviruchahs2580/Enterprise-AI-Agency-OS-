import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface Deployment { id: string; project_id: string; environment: string; strategy: string; version: string; status: string; created_at: string; }

export default function Deployments() {
  const { data, isLoading, isError, error } = useApiQuery<{ items: Deployment[] }>("deployments", "/deployments?limit=100");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Deployments</h1>
        <p className="text-sm text-text-dim">Promotion history across environments. Canary/blue-green automation is on the roadmap.</p>
      </div>
      {isLoading ? <Skeleton className="h-40" /> : isError ? (
        <Card><div className="text-err">{(error as Error).message}</div></Card>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="No deployments yet" hint="Deployments are recorded when a delivery reaches promotion." />
      ) : (
        <Card title={`Deployments (${data?.items.length ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-text-dim border-b border-border">
                <th className="py-2 pr-3">Environment</th><th className="py-2 pr-3">Strategy</th><th className="py-2 pr-3">Version</th><th className="py-2 pr-3">Status</th><th className="py-2">Created</th>
              </tr></thead>
              <tbody>
                {(data?.items ?? []).map((d)=>(
                  <tr key={d.id} className="border-b border-border">
                    <td className="py-2 pr-3">{d.environment}</td>
                    <td className="py-2 pr-3 text-text-dim">{d.strategy}</td>
                    <td className="py-2 pr-3 font-mono text-text-faint">{d.version}</td>
                    <td className="py-2 pr-3"><Badge tone={d.status==="succeeded"?"ok":d.status==="failed"?"err":"accent"}>{d.status}</Badge></td>
                    <td className="py-2 text-text-faint">{new Date(d.created_at).toLocaleString()}</td>
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
