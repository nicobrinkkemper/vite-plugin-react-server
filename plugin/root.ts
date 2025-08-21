export const pluginRoot = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
export const userProjectRoot =
  process.argv
    .find((arg) => arg.includes("node_modules"))
    ?.match(/^(.+?)\/node_modules\/.+$/)?.[1] ||
  process.env["npm_config_local_prefix"] ||
  process.cwd();
export const isLinked = !pluginRoot.startsWith(userProjectRoot);