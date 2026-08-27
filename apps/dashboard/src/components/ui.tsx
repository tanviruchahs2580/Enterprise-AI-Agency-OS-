import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";
type Size = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60";
const sizes: Record<Size, string> = {
  sm: "text-xs px-2.5 py-1.5",
  md: "text-sm px-3.5 py-2",
};
const variants: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110",
  secondary: "bg-bg-hover text-text border border-border hover:bg-bg-elevated",
  danger: "bg-crit text-white hover:brightness-110",
  ghost: "text-text-dim hover:bg-bg-hover hover:text-text",
  outline: "bg-transparent text-text border border-border hover:bg-bg-hover",
};

export type Theme = "light" | "dark";

export function useTheme(): [Theme, (t: Theme) => void] {
  const get = () =>
    (document.documentElement.dataset.theme as Theme) || "dark";
  const set = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("ui-theme", t); } catch {}
    window.dispatchEvent(new CustomEvent("theme", { detail: t }));
  };
  return [get(), set];
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Card({
  title,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`bg-bg-panel border border-border rounded-lg shadow-soft animate-fade-in ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">{title}</h3>
          {actions}
        </header>
      )}
      <div className={padded ? "p-4" : ""}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  succeeded: "text-ok border-ok/40 bg-ok/10",
  completed: "text-ok border-ok/40 bg-ok/10",
  healthy: "text-ok border-ok/40 bg-ok/10",
  approved: "text-ok border-ok/40 bg-ok/10",
  active: "text-ok border-ok/40 bg-ok/10",
  running: "text-accent border-accent/40 bg-accent/10",
  in_progress: "text-accent border-accent/40 bg-accent/10",
  deploying: "text-accent border-accent/40 bg-accent/10",
  busy: "text-accent border-accent/40 bg-accent/10",
  pending: "text-warn border-warn/40 bg-warn/10",
  waiting_approval: "text-warn border-warn/40 bg-warn/10",
  degraded: "text-warn border-warn/40 bg-warn/10",
  review: "text-warn border-warn/40 bg-warn/10",
  qa: "text-warn border-warn/40 bg-warn/10",
  failed: "text-err border-err/40 bg-err/10",
  dead_letter: "text-err border-err/40 bg-err/10",
  open: "text-err border-err/40 bg-err/10",
  critical: "text-crit border-crit/40 bg-crit/10",
  high: "text-err border-err/40 bg-err/10",
  medium: "text-warn border-warn/40 bg-warn/10",
  low: "text-text-dim border-border bg-bg-hover",
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const s = String(children);
  const cls = TONES[tone ?? s.replace(/\s/g, "_")] ?? "text-text-dim border-border bg-bg-hover";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

export function StatCard({
  value,
  label,
  tone = "text",
  hint,
}: {
  value: ReactNode;
  label: string;
  tone?: string;
  hint?: ReactNode;
}) {
  return (
    <div className="bg-bg-panel border border-border rounded-lg p-4 shadow-soft animate-fade-in">
      <div className={`text-2xl font-bold ${tone === "err" ? "text-err" : tone === "ok" ? "text-ok" : "text-text"}`}>
        {value}
      </div>
      <div className="text-xs text-text-dim mt-1">{label}</div>
      {hint && <div className="text-[11px] text-text-faint mt-1">{hint}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="h-10 w-10 rounded-full bg-bg-hover border border-border flex items-center justify-center text-text-faint mb-3">
        ◇
      </div>
      <p className="text-text font-medium">{title}</p>
      {hint && <p className="text-sm text-text-dim mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
