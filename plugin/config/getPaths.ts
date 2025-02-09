import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const getNodePath = (root: string = process.cwd()): string => {
  return (process.env['module_root'] ?? join(root, "node_modules"));
}

export const getPluginRoot = (): string => {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  return join(__dirname, '..');
}

export const getMode = (): "production" | "development" | "test" => {
  return process.env['NODE_ENV'] === "development" 
    ? "development" 
    : process.env['NODE_ENV'] === "test" 
      ? "test" 
      : "production";
}

export const getDistDir = (mode: "production" | "development" | "test"): string => {
  return mode === 'production' 
    ? join(process.cwd(), 'dist') 
    : join(process.cwd(), 'test/fixtures/dist');
} 
