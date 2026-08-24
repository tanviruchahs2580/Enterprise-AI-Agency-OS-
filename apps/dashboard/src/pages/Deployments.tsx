import { api, useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface Deployment {
  id: string;
  project_id: string;
  environment: string;
  strategy: string;
  version: string;
  commit_sha: string;
  status: string;
  rollback_of: string | null;
  created_at: string;
}

export default function Deployments() {
  const { data, loading, error, reload } = useApi<{ items: Deployment[] }>("/deployments");

  function rollback(id: string) {
    if (!confirm("Trigger rollback? This creates a corrective deployment.")) return;
    api("POST", `/deployments/${id}/rollback`)
      .then(() => reload())
      .catch((e: Error) => alert(`Rollback failed: ${e.message}`));
  }

  return (
    <>
      <h1>Deployments</h1>
      <p className="subtitle">Environment history with one-click rollback (approval-gated).</p>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (data?.items ?? []).length === 0 ? (
        <Panel title="History"><Empty what="deployments" /></Panel>
      ) : (
        <Panel title={`History (${data?.items.length ?? 0})`}>
          <table>
            <thead>
              <tr><th>Version</th><th>Env</th><th>Strategy</th><th>Status</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((d) => (
                <tr key={d.id}>
                  <td className="mono">
                    {d.version}
                    <div className="muted" style={{ fontSize: 11 }}>{d.commit_sha.slice(0, 8)}</div>
                  </td>
                  <td>{d.environment}</td>
                  <td className="muted">{d.strategy}{d.rollback_of ? " · corrective" : ""}</td>
                  <td><Badge>{d.status}</Badge></td>
                  <td className="muted">{fmtTime(d.created_at)}</td>
                  <td>
                    {d.environment === "production" && d.status === "succeeded" ? (
                      <button className="danger small" onClick={() => rollback(d.id)}>
                        Rollback
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
