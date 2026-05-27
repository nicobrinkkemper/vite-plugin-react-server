import { use, useCallback, useState, useTransition } from "react";
import { createRoot } from "react-dom/client";
import { createReactFetcher } from "vite-plugin-react-server/utils/rsc-client";
import { useRscHmr } from "virtual:react-server/hmr";

const Shell = ({ data }: { data: React.Usable<React.ReactNode> }) => {
  const [, startTransition] = useTransition();
  const [stream, setStream] = useState(data);
  const refetch = useCallback(() => {
    startTransition(() => setStream(createReactFetcher()));
  }, []);
  useRscHmr(refetch);
  return <>{use(stream)}</>;
};

const root = document.getElementById("root")!;
createRoot(root).render(<Shell data={createReactFetcher()} />);
