import "./assertServerCondition.js";
export { reactStreamPlugin } from "./react-server/plugin.js";

// the main plugin is version is the server version, if you want the client version, use the `vite-plugin-react-server/client` import
// this is because the workflow assumes main thread = react server condition
