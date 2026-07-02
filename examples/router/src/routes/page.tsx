import { Nav } from "../components/Nav.client.js";

// A server component that renders a package-shipped client component (Link, via
// Nav) directly — hosted with zero config.
export const Page = ({ title }: { title: string }) => (
  <main>
    <h1 data-testid="title">{title}</h1>
    <Nav />
  </main>
);
