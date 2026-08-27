import { Component, type ErrorInfo, type ReactNode } from "react";

export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };
  static getDerivedStateFromError(err: Error) {
    return { hasError: true, message: err.message };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("UI error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="min-h-screen flex items-center justify-center p-6">
            <div className="bg-bg-panel border border-border rounded-lg p-6 max-w-md text-center shadow-pop">
              <h1 className="text-lg font-semibold text-err mb-2">Something went wrong</h1>
              <p className="text-sm text-text-dim mb-4">{this.state.message}</p>
              <button
                className="bg-accent text-white rounded-md px-3.5 py-2 text-sm font-medium"
                onClick={() => location.reload()}
              >
                Reload
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
