import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getApiKey, setApiKey, api } from "./api.ts";
import { useApiQuery } from "./components/useEventStream.ts";
import { Button } from "./components/ui.tsx";

const NAV = [
  { to: "/", label: "Overview", icon: "◧", end: true },
  { to: "/projects", label: "Projects", icon: "▣" },
  { to: "/tasks", label: "Tasks", icon: "☑" },
  { to: "/delivery", label: "Delivery", icon: "⚡" },
  { to: "/agents", label: "Agents", icon: "◉" },
  { to: "/models", label: "Models & Cost", icon: "◈" },
  { to: "/security", label: "Security", icon: "⛨" },
  { to: "/approvals", label: "Approvals", icon: "✔" },
  { to: "/deployments", label: "Deployments", icon: "⤴" },
  { to: "/knowledge", label: "Knowledge", icon: "❖" },
  { to: "/audit", label: "Audit Log", icon: "⛯" },
  { to: "/settings", label: "Settings", icon: "⚙" },
];

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(
    () => (document.documentElement.dataset.theme === "light" ? "light" : "dark")
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("ui-theme", theme);
    } catch {}
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

export default function App() {
  const [authed, setAuthed] = useState(() => Boolean(getApiKey()));
  const [mobileNav, setMobileNav] = useState(false);
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const notifications = useApiQuery<{ items: { id: string; title: string; created_at: string }[]; unreadCount: number }>(
    "notifications",
    "/notifications"
  );

  useEffect(() => setMobileNav(false), [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileNav(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // A valid httpOnly session cookie alone is enough to enter the console (no
  // persisted key). Probe the session endpoint; any error leaves the login gate.
  useEffect(() => {
    let alive = true;
    api<{ active: boolean }>("GET", "/auth/session")
      .then((r) => { if (alive && r.active) setAuthed(true); })
      .catch(() => { /* no cookie session and no key yet */ })
      .finally(() => { if (alive) setAuthed((a) => a); });
    return () => { alive = false; };
  }, []);

  if (!authed) {
    return <Login onAuth={(k) => { setApiKey(k); setAuthed(true); }} />;
  }

  return (
    <div className="flex min-h-screen bg-bg text-text">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-white">Skip to content</a>
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-bg-panel">
        <div className="px-5 py-4 border-b border-border">
          <div className="font-bold text-[15px] tracking-tight">Agency OS</div>
          <div className="text-[11px] text-text-dim">Enterprise Control Plane</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Primary navigation">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-2 text-sm font-medium ${
                  isActive ? "text-text bg-bg-hover border-l-2 border-accent" : "text-text-dim hover:text-text hover:bg-bg-hover/50 border-l-2 border-transparent"
                }`
              }
            >
              <span className="w-4 text-center text-text-faint">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="m-3 text-sm text-text-dim hover:text-text"
          onClick={() => { setApiKey(""); setAuthed(false); }}
        >
          ⏻ Lock console
        </button>
      </aside>

      {/* Mobile nav drawer */}
      {mobileNav && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileNav(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-bg-panel border-r border-border p-3">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="block px-3 py-2 text-sm text-text-dim hover:text-text rounded-md">
                {n.label}
              </NavLink>
            ))}
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-bg-panel/80 backdrop-blur px-4 py-2.5">
          <button className="md:hidden text-text-dim" onClick={() => setMobileNav(true)} aria-label="Open navigation">☰</button>
          <div className="flex-1 max-w-md">
            <input
              placeholder="Search projects, tasks, knowledge…"
              className="w-full bg-bg border border-border rounded-md px-3 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/60"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.currentTarget.value.trim()) {
                  navigate(`/search?q=${encodeURIComponent(e.currentTarget.value.trim())}`);
                }
              }}
            />
          </div>
          <button onClick={toggle} className="text-text-dim hover:text-text text-lg" aria-label="Toggle theme" title="Toggle theme">
            {theme === "dark" ? "☀" : "☾"}
          </button>
          <button className="relative text-text-dim hover:text-text" aria-label="Notifications">
            ⛯
            {notifications.data && notifications.data.unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-crit text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center">
                {notifications.data.unreadCount}
              </span>
            )}
          </button>
          <div className="h-8 w-8 rounded-full bg-accent/20 text-accent flex items-center justify-center text-sm font-semibold">A</div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-x-hidden px-5 py-5 lg:px-7 max-w-[1400px] w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Login({ onAuth }: { onAuth: (k: string) => void }) {
  const [draft, setDraft] = useState("");
  const [sso, setSso] = useState(false);
  const navigate = useNavigate();
  // Probe the public /meta endpoint to learn whether OIDC/SSO sign-in exists.
  useEffect(() => {
    let alive = true;
    api<{ capabilities: { auth: { modes: string[] } } }>("GET", "/meta")
      .then((m) => { if (alive) setSso((m.capabilities?.auth?.modes ?? []).includes("oidc-sso")); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return (
    <div className="min-h-screen grid place-items-center bg-bg p-4">
      <div className="w-[380px] bg-bg-panel border border-border rounded-xl p-7 shadow-pop animate-fade-in">
        <div className="font-bold text-lg">Agency OS</div>
        <div className="text-xs text-text-dim mb-5">Enterprise Control Plane</div>

        {sso && (
          <>
            <a href="/api/v1/auth/oidc/login" className="block w-full">
              <Button type="button" className="w-full" variant="outline">Continue with SSO</Button>
            </a>
            <div className="flex items-center gap-2 my-4 text-xs text-text-dim">
              <span className="h-px flex-1 bg-border" /><span>or API key</span><span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        <form
          className={sso ? "" : ""}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) { onAuth(draft.trim()); navigate("/"); }
          }}
        >
          <p className="text-sm text-text-dim mb-4">
            Enter your control-plane API key. The bootstrap admin key is printed once when the server starts.
          </p>
          <label htmlFor="apikey" className="block text-xs text-text-dim mb-1">API key</label>
          <input
            id="apikey"
            className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/60"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="paste API key…"
            autoFocus={!sso}
          />
          <div className="mt-4">
            <Button type="submit" disabled={!draft.trim()} className="w-full">Sign in</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
