import { startClient } from "vite-plugin-react-server/router/client";

// The supplied client entry: hydration, client navigation, HMR, and dev
// error recovery (a broken server-component edit shows the error in place
// and the page re-renders when the file is fixed) in one call.
startClient({ moduleBaseURL: "/" });
