import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getApiKey, setApiKey } from "./api.ts";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/projects", label: "Projects" },
  { to: "/tasks", label: "Tasks" },
  { to: "/delivery", label: "Delivery" },
  { to: "/agents", label: "Agents" },
  { to: "/models", label: "Models & Cost" },
  { to: "/security", label: "Security" },
  { to: "/approvals", label: "Approvals" },
  { to: "/deployments", label: "Deployments" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/audit", label: "Audit Log" },
  { to: "/settings", label: "Settings" },
];

export default function App() {
  const [key, setKey] = useState(getApiKey());
  const [draft, setDraft] = useState(key);
  const navigate = useNavigate();

  if (!key) {
    return (
      <div className="login-wrap">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            setApiKey(draft.trim());
            setKey(draft.trim());
            navigate("/");
          }}
        >
          <h1>Agency OS</h1>
          <p className="muted">
            Enter your control-plane API key. The bootstrap admin key is printed
            once when the server starts.
          </p>
          <label htmlFor="apikey">API key</label>
          <input
            id="apikey"
            style={{ width: "100%" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="paste API key…"
            autoFocus
          />
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={!draft.trim()}>
              Sign in
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Agency OS
          <small>Enterprise Control Plane</small>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end as boolean | undefined}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="secondary small"
          style={{ margin: "12px 20px", width: "fit-content" }}
          onClick={() => {
            setApiKey("");
            setKey("");
          }}
        >
          Lock console
        </button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
