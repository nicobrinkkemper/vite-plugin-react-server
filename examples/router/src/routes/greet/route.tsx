// Section layout for `/greet/*`: nests INSIDE the root layout and wraps the
// greeting pages. It has its OWN loader (this segment's props.ts → `{ section }`),
// so a matched `/greet/ada` composes as root-layout › greet-layout › page, each
// with its own props — the parity feature (nested layouts + per-layer loaders).
export const Layout = ({
  section,
  children,
}: {
  section?: string;
  children?: React.ReactNode;
}) => (
  <section data-testid="greet-layout">
    <p data-testid="section-label">{section}</p>
    {children}
  </section>
);
