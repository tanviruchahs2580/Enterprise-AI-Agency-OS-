import { useState } from "react";
import { api, useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface Approval {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  reason: string;
  risk_level: string;
  requested_by: string;
  created_at: string;
  expires_at: string;
}

export default function Approvals() {
  const { data, loading, error, reload } = useApi<{ items: Approval[] }>("/approvals/pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function decide(id: string, decision: "approve" | "reject") {
    setBusy(id);
    setMsg(null);
    api("POST", `/approvals/${id}/decide`, { decision })
      .then(() => reload())
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(null));
  }

  return (
    <>
      <h1>Human Approval Gates</h1>
      <p className="subtitle">
        Production deploys, destructive migrations and secret rotation cannot proceed
        without a human decision here.
      </p>

      {msg && <ErrorBox message={msg} />}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (data?.items ?? []).length === 0 ? (
        <Panel title="Pending"><Empty what="pending approvals — nothing is waiting on you" /></Panel>
      ) : (
        <div className="grid cols-2">
          {(data?.items ?? []).map((a) => (
            <Panel key={a.id} title={a.action}>
              <div className="row spread">
                <Badge>{a.risk_level}</Badge>
                <span className="muted">{fmtTime(a.created_at)}</span>
              </div>
              <p>{a.reason}</p>
              <p className="muted mono" style={{ fontSize: 11.5 }}>
                {a.resource_type}:{a.resource_id.slice(0, 18)} · by {a.requested_by}
              </p>
              <div className="row">
                <button
                  disabled={busy === a.id}
                  onClick={() => decide(a.id, "approve")}
                >
                  Approve
                </button>
                <button
                  className="danger"
                  disabled={busy === a.id}
                  onClick={() => decide(a.id, "reject")}
                >
                  Reject
                </button>
                <span className="muted">expires {fmtTime(a.expires_at)}</span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
