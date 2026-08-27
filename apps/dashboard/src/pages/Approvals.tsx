import { useState } from "react";
import { api } from "../api.ts";
import { useApiQuery } from "../components/useEventStream.ts";
import { useToast } from "../components/Toast.tsx";
import { Card, Badge, Button, Skeleton, EmptyState } from "../components/ui.tsx";

interface Approval { id: string; action: string; resource_type: string; resource_id: string; reason: string; risk_level: string; requested_by: string; created_at: string; expires_at: string; decision?: string; decidedAt?: string; }

export default function Approvals() {
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const pending = useApiQuery<{ items: Approval[] }>("approvals", "/approvals/pending");
  const history = useApiQuery<{ items: Approval[] }>("approvals-history", "/approvals");
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    api("POST", `/approvals/${id}/decide`, { decision })
      .then(() => { toast.success(`Approval ${decision}d`); pending.refetch(); history.refetch(); })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setBusy(null));
  }

  const historyItems = (history.data?.items ?? []).filter((a) => a.decision && a.decision !== "pending");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Human Approval Gates</h1>
        <p className="text-sm text-text-dim">Production deploys, destructive migrations and secret rotation cannot proceed without a human decision here.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        <button onClick={() => setTab("pending")} className={`px-4 py-2 text-sm font-medium ${tab === "pending" ? "text-text border-b-2 border-accent" : "text-text-dim hover:text-text"}`}>Pending {pending.data ? `(${pending.data.items.length})` : ""}</button>
        <button onClick={() => setTab("history")} className={`px-4 py-2 text-sm font-medium ${tab === "history" ? "text-text border-b-2 border-accent" : "text-text-dim hover:text-text"}`}>History {historyItems.length ? `(${historyItems.length})` : ""}</button>
      </div>

      {tab === "pending" ? (
        pending.isLoading ? <Skeleton className="h-40" /> : pending.isError ? (
          <Card><div className="text-err">{(pending.error as Error).message}</div></Card>
        ) : (pending.data?.items ?? []).length === 0 ? (
          <EmptyState title="Nothing is waiting on you" hint="Pending approvals for high-risk actions will appear here." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(pending.data?.items ?? []).map((a) => (
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
        )
      ) : (
        history.isLoading ? <Skeleton className="h-40" /> : history.isError ? (
          <Card><div className="text-err">{(history.error as Error).message}</div></Card>
        ) : historyItems.length === 0 ? (
          <EmptyState title="No approval decisions yet" hint="Decided approvals (approved/rejected/expired) will be recorded here." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {historyItems.map((a) => (
              <Card key={a.id}>
                <div className="flex items-center justify-between mb-2">
                  <Badge tone={a.risk_level === "critical" ? "crit" : a.risk_level === "high" ? "err" : "warn"}>{a.risk_level}</Badge>
                  <Badge tone={a.decision === "approved" ? "ok" : a.decision === "rejected" ? "err" : "warn"}>{a.decision}</Badge>
                </div>
                <div className="font-semibold">{a.action}</div>
                <p className="text-sm text-text-dim mt-1">{a.reason}</p>
                <p className="text-xs text-text-faint mt-2 font-mono">{a.resource_type}:{a.resource_id.slice(0,18)}</p>
                <p className="text-xs text-text-faint mt-1">decided {a.decidedAt ? new Date(a.decidedAt).toLocaleString() : "—"}</p>
              </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
}
