import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { Button } from "~src/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex items-center justify-center h-screen bg-black-900 text-fg-muted font-sans">
          <div className="text-center p-8">
            <h1 className="text-lg font-medium mb-2">Something went wrong</h1>
            <p className="text-sm text-fg-subtle mb-4">{this.state.error?.message}</p>
            <Button variant="secondary" onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
