import { join } from "node:path";

type LoadModule = (fullPath: string) => Promise<Record<string, any>>;

export function resolveServerAction(
  id: string,
  params: {
    projectRoot: string;
    moduleBasePath: string;
  }
) {
  const [filePath, exportName] = id.split("#");
  if (!filePath || !exportName) {
    throw new Error(
      `Invalid server action ID format: ${id}. Expected format: "path/to/file.ts#exportName"`
    );
  }
  const basePath = params.moduleBasePath || "/";
  const withoutBase = filePath.startsWith(basePath)
    ? filePath.slice(basePath.length)
    : filePath;
  const normalized = withoutBase.startsWith("/")
    ? withoutBase.slice(1)
    : withoutBase;
  const fullPath = join(params.projectRoot, normalized);
  return { fullPath, exportName };
}

export async function executeServerAction(
  id: string,
  args: unknown[],
  params: {
    projectRoot: string;
    moduleBasePath: string;
    loader: LoadModule;
  }
) {
  const { fullPath, exportName } = resolveServerAction(id, params);
  const module = await params.loader(fullPath);
  const action = module[exportName];
  if (typeof action !== "function") {
    throw new Error(`Server action not found: ${id}`);
  }
  return action(...args);
}
