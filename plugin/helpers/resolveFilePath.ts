import { join, basename } from "node:path";
import { access, realpath } from "node:fs/promises";
import { normalizePath } from "vite";
import { getDistDir, getMode, getNodePath, getPluginRoot } from "../config/getPaths.js";
import pkg from "../../package.json" with { type: 'json' };

type ResolveOptions = {
  projectRoot?: string;
  nodePath?: string;
  pluginRoot?: string;
  filePath: string;
  subDir?: string;
  normalize?: boolean;
  distDir?: string;
  mode?: "production" | "development" | "test";
};

export async function resolveFilePath({ 
  projectRoot = process.cwd(),
  nodePath = getNodePath(projectRoot),
  mode = getMode(),
  pluginRoot = getPluginRoot(),
  distDir = getDistDir(mode),
  filePath,
  subDir,
  normalize = false,
}: ResolveOptions) {
  try {
    let resolvedPath: string | undefined;

    // Helper to check if file exists
    const exists = async (path: string) => {
      try {
        await access(path);
        return true;
      } catch {
        return false;
      }
    };

    // If it's a plugin export (like '/rsc-worker'), use exports map
    if (filePath.startsWith('/') && filePath.slice(1) in pkg.exports) {
      const exportPath = filePath.slice(1);
      const pluginPath = pkg.exports[exportPath as keyof typeof pkg.exports];
      return join(process.cwd(), pluginRoot, pluginPath); // Make absolute
    }

    // In test mode, preserve relative paths
    if (mode === 'test' && !filePath.startsWith('/')) {
      return filePath;
    }

    // For all other paths, try relative to project root first
    const projectPath = join(projectRoot, filePath);
    if (await exists(projectPath)) {
      return normalize ? normalizePath(projectPath) : projectPath;
    }

    // 1. Try dist folder
    const distPath = join(distDir, subDir ?? '', basename(filePath));
    if (await exists(distPath)) {
      resolvedPath = await realpath(distPath);
    }

    // 2. Try node_modules path
    if (!resolvedPath && filePath.startsWith('/node_modules/')) {
      const npmPath = join(nodePath, filePath.slice('/node_modules/'.length));
      if (await exists(npmPath)) {
        resolvedPath = await realpath(npmPath);
      }
    }

    // 3. Try direct path
    if (!resolvedPath && await exists(filePath)) {
      resolvedPath = await realpath(filePath);
    }

    // 4. Try relative to project root
    if (!resolvedPath) {
      const projectPath = join(projectRoot, filePath);
      if (await exists(projectPath)) {
        resolvedPath = await realpath(projectPath);
      }
    }

    if (!resolvedPath) {
      throw new Error(
        `Could not resolve path. Tried:\n` +
        `- ${distPath}\n` +
        `- ${join(nodePath, filePath.slice('/node_modules/'.length))}\n` +
        `- ${filePath}\n` +
        `- ${join(projectRoot, filePath)}`
      );
    }

    return normalize ? normalizePath(
      resolvedPath
        .replace(pluginRoot, "/node_modules/vite-plugin-react-server")
        .replace(projectRoot, "/")
        .replace(nodePath, "/node_modules")
        .replace(/^(?!\/)/, '/')
    ) : resolvedPath;

  } catch (error) {
    // If realpath fails, return normalized input path
    return normalize ? normalizePath(filePath) : filePath;
  }
} 