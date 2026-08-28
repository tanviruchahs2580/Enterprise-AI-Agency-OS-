import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import { useApiQuery } from "../components/useEventStream.ts";
import { useToast } from "../components/Toast.tsx";
import { Card, Badge, Button, EmptyState, Skeleton } from "../components/ui.tsx";

interface Project { id: string; name: string; slug: string; description: string; status: string; created_at: string; }
interface RosterAgent { id: string; name: string; role: string; status: string; }

export default function Projects() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<{ items: Project[] }>("projects", "/projects?limit=100");
  const roster = useApiQuery<{ items: RosterAgent[] }>("agents", "/agents");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  function toggleAgent(id: string) {
    setSelectedAgents((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function create() {
    setBusy(true);
    try {
      const proj = await api<{ id: string }>("POST", "/projects", { name, description: desc });
      const pid = proj.id;
      let addedAgents = 0;
      let addedInstructions = 0;
      for (const aid of selectedAgents) {
        await api("POST", `/projects/${pid}/agents`, { agentId: aid, roleInProject: "member" });
        addedAgents++;
      }
      for (const line of instructions.split("\n").map((s) => s.trim()).filter(Boolean)) {
        await api("POST", `/projects/${pid}/requirements`, { title: line, description: "", source: "manual" });
        addedInstructions++;
      }
      toast.success(`Project created · ${addedAgents} agent(s) assigned · ${addedInstructions} instruction(s) added`);
      setName(""); setDesc(""); setSelectedAgents([]); setInstructions("");
      refetch();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  if (isLoading) return <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-24"/>)}</div>;
  if (isError) return <Card><div className="text-err">{(error as Error).message}</div><Button className="mt-3" onClick={()=>refetch()}>Retry</Button></Card>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <p className="text-sm text-text-dim">Every engagement runs through the gated SDLC lifecycle. Create a project and staff it with agents + instructions up front.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Create project" className="lg:col-span-1">
          <label className="block text-xs text-text-dim mb-1">Name</label>
          <input className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/60" value={name} onChange={(e)=>setName(e.target.value)} placeholder="e.g. Billing Service" />
          <label className="block text-xs text-text-dim mb-1 mt-3">Description</label>
          <textarea className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/60" rows={3} value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="What does success look like?" />

          <label className="block text-xs text-text-dim mb-1 mt-3">Assign agents (based on the working procedure)</label>
          {roster.isLoading ? <Skeleton className="h-16" /> : (
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {(roster.data?.items ?? []).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggleAgent(a.id)}
                  className={`rounded-full px-2.5 py-1 text-xs border ${selectedAgents.includes(a.id) ? "bg-accent text-white border-accent" : "border-border text-text-dim hover:border-accent"}`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          )}

          <label className="block text-xs text-text-dim mb-1 mt-3">Instructions / requirements (one per line)</label>
          <textarea className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/60" rows={4} value={instructions} onChange={(e)=>setInstructions(e.target.value)} placeholder={"Add a landing page\nWire Stripe checkout\nWrite E2E tests"} />

          <div className="mt-3"><Button onClick={create} disabled={!name.trim() || busy}>{busy ? "Creating…" : "Create project"}</Button></div>
        </Card>

        <Card title={`Projects (${data?.items.length ?? 0})`} className="lg:col-span-2">
          {(data?.items ?? []).length === 0 ? (
            <EmptyState title="No projects yet" hint="Create your first project to begin an autonomous delivery." />
          ) : (
            <div className="divide-y divide-border">
              {(data?.items ?? []).map((p) => (
                <button key={p.id} onClick={()=>navigate(`/projects/${p.id}`)} className="w-full text-left py-3 flex items-center justify-between hover:bg-bg-hover/50 rounded-md px-2 -mx-2">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-text-faint font-mono">{p.slug}</div>
                  </div>
                  <Badge tone={p.status}>{p.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
