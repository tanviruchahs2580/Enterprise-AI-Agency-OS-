import type { ReactNode } from "react";

export function Panel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel">
      <div className="row spread">
        <h3>{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Stat({ value, label, tone }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div className="panel stat">
      <div className={`value ${tone ?? ""}`}>{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

const TONES: Record<string, string> = {
  succeeded: "ok", completed: "ok", healthy: "ok", approved: "ok", active: "ok",
  running: "accent", in_progress: "accent", deploying: "accent", busy: "accent",
  pending: "warn", waiting_approval: "warn", degraded: "warn", review: "warn", qa: "warn",
  failed: "err", dead_letter: "err", open: "err", critical: "err", high: "err",
};

export function Badge({ children }: { children: string | number }) {
  const s = String(children);
  return <span className={`badge ${TONES[s] ?? ""}`}>{s.replace(/_/g, " ")}</span>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <div className="loading">{label}</div>;
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <div className="error-box" role="alert">
      {message}
    </div>
  );
}

export function Empty({ what }: { what: string }) {
  return <div className="empty">No {what} yet.</div>;
}

export function fmtUsd(n: unknown): string {
  return `$${Number(n ?? 0).toFixed(4)}`;
}

export function fmtTime(iso: unknown): string {
  if (!iso) return "—";
  const d = new Date(String(iso));
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}
