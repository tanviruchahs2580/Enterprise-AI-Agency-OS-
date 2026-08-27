import { useState } from "react";
import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface Finding { id: string; severity: string; title: string; tool: string; status: string; detected_at: string; }

export default function Security() {
  const [severity, setSeverity] = useState("");
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ items: Finding[] }>(
    "findings" + severity, `/security/findings${severity ? `?severity=${severity}` : ""}`
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Security Operations</h1>
        <p className="text-sm text-text-dim">Findings flow: detect → triage → investigate → mitigate. Critical findings block releases.</p>
      </div>

      <div className="flex items-center gap-3">
        <select value={severity} onChange={(e)=>setSeverity(e.target.value)} className="bg-bg border border-border rounded-md px-3 py-2 text-sm text-text">
          <option value="">All severities</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <button className="bg-bg-hover text-text border border-border rounded-md px-3 py-2 text-sm" onClick={()=>refetch()}>Refresh</button>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : isError ? (
        <Card><div className="text-err">{(error as Error).message}</div></Card>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="No open security findings" hint="Critical findings would appear here and block releases." />
      ) : (
        <Card title={`Findings (${data?.items.length ?? 0})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wider text-text-dim border-b border-border">
                <th className="py-2 pr-3">Severity</th><th className="py-2 pr-3">Title</th><th className="py-2 pr-3">Tool</th><th className="py-2 pr-3">Status</th><th className="py-2">Detected</th>
              </tr></thead>
              <tbody>
                {(data?.items ?? []).map((f)=>(
                  <tr key={f.id} className="border-b border-border">
                    <td className="py-2 pr-3"><Badge tone={f.severity}>{f.severity}</Badge></td>
                    <td className="py-2 pr-3">{f.title}</td>
                    <td className="py-2 pr-3 text-text-dim">{f.tool}</td>
                    <td className="py-2 pr-3"><Badge>{f.status}</Badge></td>
                    <td className="py-2 text-text-faint">{new Date(f.detected_at).toLocaleString()}</td>
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
