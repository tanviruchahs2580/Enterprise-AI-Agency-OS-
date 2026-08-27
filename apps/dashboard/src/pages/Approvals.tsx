import { useState } from "react";
import { api } from "../api.ts";
import { useApiQuery } from "../components/useEventStream.ts";
import { useToast } from "../components/Toast.tsx";
import { Card, Badge, Button, Skeleton, EmptyState } from "../components/ui.tsx";

interface Approval { id: string; action: string; resource_type: string; resource_id: string; reason: string; risk_level: string; requested_by: string; created_at: string; expires_at: string; }

export default function Approvals() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ items: Approval[] }>("approvals", "/approvals/pending");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    api("POST", `/approvals/${id}/decide`, { decision })
      .then(() => { toast.success(`Approval ${decision}d`); refetch(); })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(null));
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Human Approval Gates</h1>
        <p className="text-sm text-text-dim">Production deploys, destructive migrations and secret rotation cannot proceed without a human decision here.</p>
      </div>

      {isLoading ? <Skeleton className="h-40" /> : isError ? (
        <Card><div className="text-err">{(error as Error).message}</div></Card>
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState title="Nothing is waiting on you" hint="Pending approvals for high-risk actions will appear here." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(data?.items ?? []).map((a) => (
            <Card key={a.id}>
              <div className="flex items-center justify-between mb-2">
                <Badge tone={a.risk_level === "critical" ? "crit" : a.risk_level === "high" ? "err" : "warn"}>{a.risk_level}</Badge>
                <span className="text-xs text-text-faint">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <div className="font-semibold">{a.action}</div>
              <p className="text-sm text-text-dim mt-1">{a.reason}</p>
              <p className="text-xs text-text-faint mt-2 font-mono">{a.resource_type}:{a.resource_id.slice(0,18)} · by {a.requested_by}</p>
              <div className="flex items-center gap-2 mt-3">
                <Button disabled={busy===a.id} onClick={()=>decide(a.id,"approve")}>{busy===a.id ? "…" : "Approve"}</Button>
                <Button variant="danger" disabled={busy===a.id} onClick={()=>decide(a.id,"reject")}>Reject</Button>
                <span className="text-xs text-text-faint ml-auto">expires {new Date(a.expires_at).toLocaleString()}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
