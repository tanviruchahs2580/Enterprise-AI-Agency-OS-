import { useState } from "react";
import { useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface AuditRow {
  seq: number;
  id: string;
  actor_type: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  risk_level: string;
  decision: string;
  result: string;
  created_at: string;
}

export default function Audit() {
  const { data, loading, error, reload } = useApi<{ items: AuditRow[] }>("/audit?limit=200");
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  function verify() {
    fetch("/api/v1/audit/verify", {
      headers: { authorization: `Bearer ${localStorage.getItem("agencyos.apiKey") ?? ""}` },
    })
      .then((r) => r.json())
      .then((v: { valid?: boolean; checked?: number; brokenAtSeq?: number }) => {
        setVerifyMsg(
          v.valid
            ? `Chain valid — ${v.checked} events verified.`
            : `CHAIN BROKEN at seq ${v.brokenAtSeq} — investigate immediately.`
        );
      })
      .catch((e: Error) => setVerifyMsg(`Verification failed: ${e.message}`));
  }

  return (
    <>
      <h1>Audit Log</h1>
      <p className="subtitle">Append-only, hash-chained. Every sensitive operation is recorded.</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <button className="secondary" onClick={verify}>Verify chain integrity</button>
        {verifyMsg && <Badge>{verifyMsg.includes("valid —") ? "chain ok" : "tamper detected"}</Badge>}
        {verifyMsg && <span className="muted">{verifyMsg}</span>}
        <button className="secondary small" onClick={reload}>Refresh</button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (data?.items ?? []).length === 0 ? (
        <Empty what="audit events" />
      ) : (
        <Panel title={`Events (${data?.items.length ?? 0})`}>
          <table>
            <thead>
              <tr><th>Seq</th><th>Action</th><th>Actor</th><th>Resource</th><th>Risk</th><th>When</th></tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((r) => (
                <tr key={r.seq}>
                  <td className="mono muted">{r.seq}</td>
                  <td><strong>{r.action}</strong></td>
                  <td className="muted">{r.actor_type}:{r.actor_id.slice(0, 16)}</td>
                  <td className="muted mono">{r.resource_type}:{r.resource_id.slice(0, 12)}</td>
                  <td><Badge>{r.risk_level}</Badge></td>
                  <td className="muted">{fmtTime(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
