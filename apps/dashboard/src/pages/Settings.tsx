import { useState } from "react";
import { api } from "../api.ts";
import { getApiKey, setApiKey, clearApiKey } from "../api.ts";
import { useToast } from "../components/Toast.tsx";
import { Card, Badge, Button, useTheme } from "../components/ui.tsx";

export default function Settings() {
  const [theme, setTheme] = useTheme();
  const toast = useToast();
  const [key, setKey] = useState(getApiKey() ?? "");
  const [saving, setSaving] = useState(false);

  function saveKey() {
    setSaving(true);
    try {
      if (key.trim()) setApiKey(key.trim());
      else clearApiKey();
      toast.success("API key saved (session only)");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  function testHealth() {
    api<{ status: string }>("GET", "/health")
      .then((r)=>toast.success(`Control plane healthy (${r.status})`))
      .catch((e: Error)=>toast.error(`Unreachable: ${e.message}`));
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-text-dim">Local preferences and control-plane connection.</p>
      </div>

      <Card title="Appearance">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Theme</div>
            <div className="text-sm text-text-dim">Light or dark, persisted to localStorage.</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant={theme==="light"?"primary":"outline"} onClick={()=>setTheme("light")}>Light</Button>
            <Button variant={theme==="dark"?"primary":"outline"} onClick={()=>setTheme("dark")}>Dark</Button>
            <Badge tone="low">{theme}</Badge>
          </div>
        </div>
      </Card>

      <Card title="API Key">
        <label className="block text-xs text-text-dim mb-1">Control-plane API key (stored in sessionStorage, never persisted to disk)</label>
        <input type="password" value={key} onChange={(e)=>setKey(e.target.value)} placeholder="e.g. cpk_live_…" className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-accent/60" />
        <div className="mt-3 flex items-center gap-2">
          <Button onClick={saveKey} disabled={saving}>{saving ? "Saving…" : "Save key"}</Button>
          <Button variant="outline" onClick={testHealth}>Test connection</Button>
          {getApiKey() && <Badge tone="ok">key set</Badge>}
        </div>
      </Card>

      <Card title="About">
        <div className="text-sm text-text-dim space-y-1">
          <div>Enterprise AI Agency OS · control-plane dashboard</div>
          <div>Backend SSE, notifications, search, quality-gates, distributed rate limiting and cost governance are live.</div>
          <div className="text-text-faint">Build your own: the agency is seeded from a contract roster, not personas.</div>
        </div>
      </Card>
    </div>
  );
}
