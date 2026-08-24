import { useState } from "react";
import { useApi } from "../api.ts";
import { Badge, Empty, ErrorBox, Loading, Panel, fmtTime } from "../ui.tsx";

interface KnowledgeDoc {
  id: string;
  kind: string;
  title: string;
  content: string;
  confidence: number;
  verification_status: string;
  updated_at: string;
}

export default function Knowledge() {
  const [q, setQ] = useState("");
  const [searched, setSearched] = useState(false);
  const results = useApi<{ items: KnowledgeDoc[] }>(`/knowledge/search?q=${encodeURIComponent(q)}`, [searched]);

  return (
    <>
      <h1>Project Knowledge</h1>
      <p className="subtitle">
        Facts, decisions, handoffs and failure lessons. Unverified entries are visibly marked.
      </p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          setSearched((s) => !s);
        }}
        style={{ marginBottom: 16 }}
      >
        <input
          style={{ width: 320 }}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search knowledge…"
          aria-label="Search knowledge"
        />
        <button type="submit">Search</button>
      </form>

      {results.loading ? (
        <Loading />
      ) : results.error ? (
        <ErrorBox message={results.error} />
      ) : (results.data?.items ?? []).length === 0 ? (
        <Empty what={q ? `matches for “${q}”` : "knowledge documents"} />
      ) : (
        <div className="grid cols-2">
          {(results.data?.items ?? []).map((d) => (
            <Panel key={d.id} title={d.kind}>
              <div className="row spread">
                <strong>{d.title}</strong>
                <Badge>{d.verification_status}</Badge>
              </div>
              <p className="muted" style={{ maxHeight: 90, overflow: "hidden" }}>{d.content.slice(0, 240)}</p>
              <div className="muted" style={{ fontSize: 12 }}>
                confidence {(d.confidence * 100).toFixed(0)}% · {fmtTime(d.updated_at)}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
