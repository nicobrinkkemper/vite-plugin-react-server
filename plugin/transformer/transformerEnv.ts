export type TransformerName = "client" | "server";
export type EnvName = "client" | "server" | "ssr";

export function getEnvName(raw?: string): EnvName | "" {
  const v = (raw || "").toLowerCase();
  return v === "client" || v === "server" || v === "ssr" ? (v as EnvName) : "";
}

export function isEnvAllowed(
  allowed: ReadonlyArray<EnvName>,
  envName: EnvName | ""
): boolean {
  return !!envName && allowed.includes(envName as EnvName);
}

export function isServerTransform<T>(name: T): name is T & 'server' {
  return name === "server";
}

export function shouldApplyTransformer(
  allowed: ReadonlyArray<EnvName>,
  envName: EnvName | ""
): boolean {
  return isEnvAllowed(allowed, envName);
}

export function shouldTransformModule(opts: {
  name: TransformerName;
  ssr: boolean;
  envName: EnvName | "";
  allowed: ReadonlyArray<EnvName>;
  id: string;
  modulePattern: RegExp;
}): boolean {
  const { name, ssr, envName, allowed, id, modulePattern } = opts;

  // env not allowed → skip
  if (!isEnvAllowed(allowed, envName)) return false;

  // server transform only in SSR
  if (isServerTransform(name) && !ssr) return false;

  // module pattern mismatch → skip
  if (!modulePattern.test(id)) return false;

  return true;
}


