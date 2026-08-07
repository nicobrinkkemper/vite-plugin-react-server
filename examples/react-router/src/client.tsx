import { useCallback, useState, type ReactNode } from "react";
import { createReactFetcher, hydrateOrRender } from "vite-plugin-react-server/utils";
import { useRscHmr } from "virtual:react-server/hmr";

const Shell = ({ initialNode }: { initialNode: ReactNode }) => {
  const [node, setNode] = useState(initialNode);
  const refetch = useCallback(async () => {
    setNode(await createReactFetcher());
  }, []);
  useRscHmr(refetch);
  return <>{node}</>;
};

const root = document.getElementById("root")!;
// Resolve the flight fully, then mount — hydrateRoot adopts the prerendered
// markup in place (createRoot would replace it and flash).
hydrateOrRender(root, async () => (
  <Shell initialNode={await createReactFetcher()} />
));
