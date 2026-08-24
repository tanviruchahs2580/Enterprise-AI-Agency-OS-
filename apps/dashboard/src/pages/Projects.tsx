import { useState } from "react";
import { api, useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  repo_url: string | null;
  created_at: string;
}

export default function Projects() {
  const { data, loading, error, reload } = useApi<{ items: Project[] }>("/projects");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setFormError(null);
    try {
      await api("POST", "/projects", { name, description: desc });
      setName("");
      setDesc("");
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;

  return (
    <>
      <h1>Projects</h1>
      <p className="subtitle">Every engagement runs through the gated SDLC lifecycle.</p>

      <div className="grid cols-2">
        <Panel title="Create project">
          <label htmlFor="p-name">Name</label>
          <input
            id="p-name"
            style={{ width: "100%" }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Billing Service"
          />
          <label htmlFor="p-desc">Description</label>
          <textarea
            id="p-desc"
            style={{ width: "100%" }}
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What does success look like?"
          />
          {formError && (
            <div style={{ marginTop: 10 }}>
              <ErrorBox message={formError} />
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <button onClick={() => void create()} disabled={!name.trim() || busy}>
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </Panel>

        <Panel title={`Projects (${data?.items.length ?? 0})`}>
          {(data?.items ?? []).length === 0 ? (
            <Empty what="projects" />
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <div className="muted mono">{p.slug}</div>
                    </td>
                    <td><Badge>{p.status}</Badge></td>
                    <td className="muted">{fmtTime(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
