"use client";
import { useEffect, useState } from "react";
import { Link } from "vite-plugin-react-server/router/client";

// A client component: Link intercepts internal clicks and navigates client-side
// (fetching the next route's flight, no full reload). The "hydrated" flag flips
// after hydration — the demo/e2e uses it to prove the page hydrated and that a
// Link nav did NOT full-reload (the flag stays "hydrated" across nav).
export function Nav() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <nav>
      <Link to="/">Home</Link>
      {" · "}
      <Link to="/greet/ada">Ada</Link>
      {" · "}
      <Link to="/greet/grace">Grace</Link>
      {" — "}
      <span data-testid="hydrated">{hydrated ? "hydrated" : "server"}</span>
    </nav>
  );
}
