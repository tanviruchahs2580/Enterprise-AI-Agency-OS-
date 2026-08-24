import { useState } from "react";
import { useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface Finding {
  id: string;
  severity: string;
  title: string;
  tool: string;
  status: string;
  detected_at: string;
}

export default function Security() {
  const [severity, setSeverity] = useState("");
  const { data, loading, error, reload } = useApi<{ items: Finding[] }>(
    `/security/findings${severity ? `?severity=${severity}` : ""}`
  );

  return (
    <>
      <h1>Security Operations</h1>
      <p className="subtitle">
        Findings flow: detect → triage → investigate → mitigate. Critical findings block releases.
      </p>

      <div className="row" style={{ marginBottom: 14 }}>
        <label htmlFor="sev-filter" className="muted">Severity</label>
        <select
          id="sev-filter"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        >
          <option value="">All</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <button className="secondary small" onClick={reload}>Refresh</button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (data?.items ?? []).length === 0 ? (
        <Panel title="Findings"><Empty what="open security findings" /></Panel>
      ) : (
        <Panel title={`Findings (${data?.items.length ?? 0})`}>
          <table>
            <thead>
              <tr><th>Severity</th><th>Title</th><th>Tool</th><th>Status</th><th>Detected</th></tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((f) => (
                <tr key={f.id}>
                  <td><Badge>{f.severity}</Badge></td>
                  <td>{f.title}</td>
                  <td className="muted">{f.tool}</td>
                  <td><Badge>{f.status}</Badge></td>
                  <td className="muted">{fmtTime(f.detected_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
