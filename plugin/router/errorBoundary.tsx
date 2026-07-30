"use client";
// Namespace import for react-server barrel import-safety (see router-react.tsx).
import * as React from "react";

/** Props the fallback UI of {@link createErrorBoundary} receives. */
export type RouteErrorFallbackProps = {
  error: Error;
  /** Clears the boundary and re-renders the subtree. */
  reset: () => void;
};

type BoundaryProps = { children?: React.ReactNode };
type BoundaryState = { error: Error | null };

/**
 * Wrap a fallback UI into the client boundary an `error.tsx` route file
 * exports. The boundary catches render errors in its segment's subtree —
 * including errors a server component threw into the flight stream — and
 * renders the fallback with `{ error, reset }`:
 *
 *   "use client";
 *   import { createErrorBoundary } from "vite-plugin-react-server/router/client";
 *   export const ErrorBoundary = createErrorBoundary(({ error, reset }) => (
 *     <div>
 *       <p>{error.message}</p>
 *       <button onClick={reset}>Retry</button>
 *     </div>
 *   ));
 */
export function createErrorBoundary(
  Fallback: React.ComponentType<RouteErrorFallbackProps>,
): React.ComponentType<BoundaryProps> {
  return class RouteErrorBoundary extends React.Component<
    BoundaryProps,
    BoundaryState
  > {
    override state: BoundaryState = { error: null };
    static getDerivedStateFromError(error: unknown): BoundaryState {
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
    reset = () => this.setState({ error: null });
    override render() {
      if (this.state.error) {
        return <Fallback error={this.state.error} reset={this.reset} />;
      }
      return this.props.children;
    }
  };
}
