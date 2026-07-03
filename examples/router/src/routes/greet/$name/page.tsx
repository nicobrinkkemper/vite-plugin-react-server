import { Nav } from "../../../components/Nav.client.js";

// `name` comes from the loader (params) — the SSR-safe way to read a param, so
// it's in the prerendered HTML. (useParams() is client-only; it needs the
// RouterProvider that startClient adds at hydration.)
export const Page = ({ name }: { name: string }) => (
  <main>
    <h1 data-testid="title">Hello {name}</h1>
    <Nav />
  </main>
);
