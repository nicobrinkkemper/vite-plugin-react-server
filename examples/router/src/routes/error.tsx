"use client";
import { createErrorBoundary } from "vite-plugin-react-server/router/client";

export const ErrorBoundary = createErrorBoundary(({ error, reset }) => (
  <div data-testid="route-error" role="alert">
    <p>Something went wrong: {error.message}</p>
    <button onClick={reset}>Retry</button>
  </div>
));
