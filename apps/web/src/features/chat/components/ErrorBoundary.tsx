import React from "react";

type Props = { children: React.ReactNode; fallback?: React.ReactNode };
type State = { hasError: boolean; error?: unknown };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error };
  }
  componentDidCatch(error: unknown, info: unknown) {
    console.error("[Chat ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700" role="alert">
          Failed to render message. Try refresh.
        </div>
      );
    }
    return this.props.children;
  }
}
