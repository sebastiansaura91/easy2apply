import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-level error boundary. A malformed AI/edge-function payload rendered deep in a
 * panel would otherwise throw during render and, with no boundary, unmount the whole
 * app to a white screen. This catches it and offers a recovery path instead.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log the component stack for debugging; no user PII is included here.
    console.error("Unhandled render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-4">
            <h1 className="text-xl font-semibold">Något gick fel · Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              Ett oväntat fel inträffade. Dina sparade ändringar finns kvar.
              <br />
              An unexpected error occurred. Your saved changes are safe.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button variant="outline" onClick={this.handleReset}>Försök igen · Try again</Button>
              <Button onClick={() => { window.location.href = "/dashboard"; }}>
                Till Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
