import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_SRC =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']|<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/gi;

export function resolveIndexHtmlClientEntry(projectRoot: string): string[] {
  const path = join(projectRoot, "index.html");
  if (!existsSync(path)) return [];
  try {
    const html = readFileSync(path, "utf-8");
    const srcs: string[] = [];
    for (const m of html.matchAll(SCRIPT_SRC)) {
      const src = (m[1] ?? m[2]).replace(/^\/+/, "");
      if (src) srcs.push(src);
    }
    return srcs;
  } catch {
    return [];
  }
}
