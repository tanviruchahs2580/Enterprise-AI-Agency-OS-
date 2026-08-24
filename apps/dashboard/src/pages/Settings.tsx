import { useApi } from "../api.ts";
import { Badge, Loading, Panel } from "../ui.tsx";

interface Meta {
  name: string;
  version: string;
  apiVersion: string;
  features: Record<string, boolean>;
}

export default function Settings() {
  const meta = useApi<Meta>("/meta");

  if (meta.loading) return <Loading />;
  if (meta.error) {
    return (
      <>
        <h1>Settings</h1>
        <p className="subtitle">Sign in to view platform configuration.</p>
      </>
    );
  }

  return (
    <>
      <h1>Settings</h1>
      <p className="subtitle">
        {meta.data?.name} v{meta.data?.version} · API {meta.data?.apiVersion}
      </p>

      <div className="grid cols-2">
        <Panel title="Optional subsystems">
          {Object.entries(meta.data?.features ?? {}).map(([k, v]) => (
            <p key={k} className="row spread" style={{ borderBottom: "1px solid var(--border)", padding: "8px 0", margin: 0 }}>
              <span>{k}</span> <Badge>{v ? "enabled" : "disabled"}</Badge>
            </p>
          ))}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Disabled subsystems never affect boot or core flows (feature-flag architecture).
          </p>
        </Panel>

        <Panel title="Operational notes">
          <ul className="muted" style={{ lineHeight: 1.9 }}>
            <li>Database: SQLite locally; PostgreSQL required for production profiles.</li>
            <li>Sandbox: process provider in dev; docker provider enforced in production.</li>
            <li>Audit log is hash-chained — verify it after any incident.</li>
            <li>API keys are stored as SHA-256 hashes only.</li>
            <li>All high-risk actions require human approval from the Approvals page.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
