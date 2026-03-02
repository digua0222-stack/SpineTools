/**
 * React Error Boundary.
 *
 * Catches render errors in the component tree and displays a fallback UI
 * with error details and a reload button.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8 gap-4 bg-background text-foreground">
          <h2 className="text-lg font-semibold text-destructive">
            Something went wrong
          </h2>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            An unexpected error occurred. You can try reloading the page to
            recover.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <pre className="text-xs bg-muted p-4 rounded-md max-w-2xl overflow-auto max-h-60 w-full">
              {this.state.error.message}
              {this.state.errorInfo?.componentStack &&
                `\n\nComponent Stack:${this.state.errorInfo.componentStack}`}
            </pre>
          )}
          <Button onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
