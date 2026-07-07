// Root layout (`route.tsx`): a server component that wraps every route and
// renders `{children}` — the RSC-native `<Outlet/>`. It shares this segment's
// loader (src/routes/props.ts), so it receives `{ title }`. Nested `route.tsx`
// files add further layers around their subtree.
export const Layout = ({
  title,
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) => (
  <div data-testid="root-layout" className="app-shell">
    <header data-testid="app-title">{title}</header>
    {children}
  </div>
);
