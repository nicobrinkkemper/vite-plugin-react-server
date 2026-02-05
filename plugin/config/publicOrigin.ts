type ServerConfig = {
  https?: boolean | object;
  host?: string | boolean;
  port?: number;
};

export function getServerOrigin(server?: ServerConfig): string {
  const protocol = server?.https ? "https" : "http";
  const host =
    typeof server?.host === "string"
      ? server.host
      : "localhost";
  const port = typeof server?.port === "number" ? server.port : 5173;
  return `${protocol}://${host}:${port}`;
}

export function resolvePublicOrigin(params: {
  userOption?: string;
  envPublicOrigin?: string;
  command: "build" | "serve";
  isPreview?: boolean;
  server?: ServerConfig;
}): string {
  if (params.userOption) return params.userOption;
  if (params.envPublicOrigin) return params.envPublicOrigin;
  if (params.command === "serve" && !params.isPreview) {
    return getServerOrigin(params.server);
  }
  return "";
}
