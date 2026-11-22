import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Deliberately avoid sending exception details or user data to an unconfigured
    // telemetry service. Production observability can be added through a vetted provider.
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          role="alert"
          aria-live="assertive"
          style={{
            minHeight: "100vh",
            display: "grid",
            placeContent: "center",
            gap: 14,
            padding: 24,
            color: "#e7edf7",
            background: "#0a1020",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <div>
            <p style={{ color: "#65cfc6", fontSize: 12, letterSpacing: 2 }}>VERITYGRID</p>
            <h1 style={{ marginBottom: 8, fontSize: 24 }}>The workspace needs to reload</h1>
            <p style={{ maxWidth: 440, color: "#9aabc1", lineHeight: 1.6 }}>
              An unexpected interface error interrupted this view. Your session has not
              been intentionally changed. Reload the page to try again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              justifySelf: "center",
              border: 0,
              borderRadius: 7,
              padding: "11px 18px",
              color: "#eaffff",
              background: "#1d777c",
              cursor: "pointer",
            }}
          >
            Reload workspace
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
