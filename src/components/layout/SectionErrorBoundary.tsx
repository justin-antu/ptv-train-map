import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface SectionErrorBoundaryProps {
  /** Section name shown in the fallback, e.g. "Live network". */
  name: string;
  children: ReactNode;
}

interface SectionErrorBoundaryState {
  message: string | null;
}

/**
 * Keeps one failing section from taking down the app.
 *
 * The map and the virtualized timetable are the heaviest parts of the page; if
 * either throws, a commuter must still be able to read their departures.
 */
export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
  state: SectionErrorBoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): SectionErrorBoundaryState {
    return { message: error instanceof Error ? error.message : "Unexpected error" };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Section "${this.props.name}" failed to render`, error, info);
  }

  render(): ReactNode {
    if (this.state.message === null) return this.props.children;

    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-card/40 p-5">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{this.props.name} could not be displayed</p>
          <p className="mt-1 text-xs text-muted-foreground">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ message: null })}
            className="mt-2 text-xs font-medium text-brand underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
