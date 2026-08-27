import { useState } from "react";
import { useApiQuery } from "../components/useEventStream.ts";
import { Card, Badge, Skeleton, EmptyState } from "../components/ui.tsx";

interface KnowledgeDoc { id: string; kind: string; title: string; content: string; confidence: number; verification_status: string; updated_at: string; }

export default function Knowledge() {
  const [q, setQ] = useState("");
  const { data, isLoading, isError, error } = useApiQuery<{ items: KnowledgeDoc[] }>(
    "knowledge" + q, `/knowledge/search?q=${encodeURIComponent(q)}`
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Project Knowledge</h1>
        <p className="text-sm text-text-dim">Facts, decisions, handoffs and failure lessons. Unverified entries are visibly marked.</p>
      </div>

      <form className="flex items-center gap-3" onSubmit={(e)=>e.preventDefault()}>
        <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search knowledge…" className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/60" />
        <button className="bg-accent text-white rounded-md px-4 py-2 text-sm font-medium" type="submit">Search</button>
      </form>

      {isLoading ? <Skeleton className="h-40" /> : isError ? (
        <Card><div className="text-err">{(error as Error).message}</div></Card>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title={q ? `No matches for “${q}”` : "No knowledge documents"} hint="Knowledge is captured as agents complete work." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.items ?? []).map((d)=>(
            <Card key={d.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-text-dim">{d.kind}</span>
                <Badge tone={d.verification_status==="verified"?"ok":"warn"}>{d.verification_status}</Badge>
              </div>
              <div className="font-semibold">{d.title}</div>
              <p className="text-sm text-text-dim mt-1 line-clamp-3">{d.content.slice(0,240)}</p>
              <div className="text-xs text-text-faint mt-3">confidence {(d.confidence*100).toFixed(0)}% · {new Date(d.updated_at).toLocaleString()}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
