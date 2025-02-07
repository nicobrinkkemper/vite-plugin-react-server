"use client";
import React, {
  use,
  useCallback,
  useState,
  useTransition,
} from "react";
import { createRoot } from "react-dom/client";
import { useEventListener } from "./hooks/useEventListener.js";
import "./index.css";
import { createReactFetcher } from "./utils/createReactFetcher.js";
/**
 * Client-side React Server Components implementation
 *
 * This module handles:
 * 1. Initial hydration of server-rendered content
 * 2. Client-side navigation using RSC
 * 3. State management for RSC data
 * 4. Stream updates when files change
 */

/**
 * Main application shell component
 * Handles navigation and RSC data updates
 */
const Shell: React.FC<{
  data: React.Usable<unknown>;
}> = ({ data: initialServerData }) => {
  const [, startTransition] = useTransition();
  const [storeData, setStoreData] =
    useState<React.Usable<unknown>>(initialServerData);

  const navigate = useCallback((to: string) => {
    if ("scrollTo" in window) window.scrollTo(0, 0);
    startTransition(() => {
      // Create new RSC data stream
      setStoreData(
        createReactFetcher({
          url: to.endsWith("/") ? to + "index.rsc" : to + "/index.rsc",
        })
      );
    });
  }, []);

  // Handle browser navigation
  useEventListener("popstate", (e) => {
    console.log(e)
    if (e instanceof PopStateEvent && e.state?.to) {
      return navigate(e.state.to);
    } else {
      return navigate(window.location.pathname);
    }
  });

  const content = use(storeData);

  return <ErrorBoundary>{content as React.ReactNode}</ErrorBoundary>;
};
// Initialize the app
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

const intitalData = createReactFetcher({
  url: new URL("index.rsc", window.location.href).href,
});

createRoot(rootElement).render(<Shell data={intitalData} />);

const Redirect = ({ search }: { search?: string }) => {
  React.useEffect(() => {
    if(import.meta?.['env']?.['DEV'] || window.location.origin.includes('localhost')|| window.location.origin.includes('127.0.0.1')) {
      return;
    }
    if (!window.location.href.includes("/404")) {
      const timeout = setTimeout(() => {
        window.location.href = "/404" + search;
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, []);
  return null;
};

/**
 * Error boundary
 */
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { hasError: boolean; error: Error | null }
> {
  state: { hasError: boolean; error: Error | null } = {
    hasError: false,
    error: null,
  };
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidCatch(error: unknown) {
    console.error(error);
    this.setState({
      hasError: true,
      error:
        error instanceof Error
          ? error
          : new Error("Error", {
              cause: error,
            }),
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return <Redirect search={`?error=${this.state.error?.message}`} />;
  }
}
