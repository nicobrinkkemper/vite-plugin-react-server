import type {  StreamPluginOptions } from "vite-plugin-react-server/types";
import { getCondition, REACT_CONDITION } from "vite-plugin-react-server/config";
import { metricWatcher } from "vite-plugin-react-server/metrics";

// The suite deliberately runs BOTH paradigms over the same configs
// (test-both.sh reruns every suite under each condition), so the declared
// runner must track the ambient condition or the runner/condition invariant
// errors the whole matrix. Real consumer configs declare a literal runner.
// (/config, not the root entry: every suite imports this file, and the root
// entry drags the TLA orchestrator dispatcher graph along for no reason.)
export const runnerForCondition = (): "main" | "isolated" =>
  getCondition() === REACT_CONDITION.server ? "main" : "isolated";

// Transport matrix knob — the transport twin of test-both.sh's condition
// rerun. VPRS_TEST_TRANSPORT=webpack reruns transport-AGNOSTIC suites with
// the webpack flight flavor (scripts/test-transport-webpack.sh holds the
// curated list). Suites whose assertions encode esm artifacts by design
// (bare module-path reference rows, esm SSG pass events, snapshots without a
// bake) branch or skip on TEST_TRANSPORT rather than run wrong-flavored.
export const TEST_TRANSPORT: "esm" | "webpack" =
  process.env.VPRS_TEST_TRANSPORT === "webpack" ? "webpack" : "esm";

export const testUserOptions = {
  ...(TEST_TRANSPORT === "webpack" ? { transport: "webpack" as const } : {}),
  runner: runnerForCondition(),
  moduleBase: "src",
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  propsExportName: "props",
  moduleBasePath: '',
  moduleBaseURL: typeof process.env.VITE_BASE_URL === 'string' ? process.env.VITE_BASE_URL : '/',
  verbose: false,
  // Enable metricWatcher to catch backpressure issues
  onMetrics: metricWatcher({
    maxTime: 200,           // Warn if processing takes > 200ms
    maxBackpressure: 0,     // Warn if ANY backpressure occurs (0 = warn on first occurrence)
    warnOnly: false,        // Show both warnings and info messages
  }),
  build: {
    pages: ["/"],
    assetsDir: 'assets',
    client: "client",
    server: "server",
    static: "static",
    outDir: "dist",
  },
  css: {
    inlineCss: false,
  },
} satisfies StreamPluginOptions;


