import { join } from 'node:path';

export const getNodePath = (root: string = process.cwd()): string => {
  return process.env['module_root'] ?? join(root, "node_modules");
}

export const getMode = (): "production" | "development" | "test" => {
  return process.env['NODE_ENV'] === "development" 
    ? "development" 
    : process.env['NODE_ENV'] === "test" 
      ? "test" 
      : "production";
}