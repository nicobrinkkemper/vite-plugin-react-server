import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_SRC =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']|<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*\btype=["']module["']/i;

export function resolveIndexHtmlClientEntry(
  projectRoot: string,
): string | null {
  const path = join(projectRoot, "index.html");
  if (!existsSync(path)) return null;
  try {
    const m = readFileSync(path, "utf-8").match(SCRIPT_SRC);
    return m ? (m[1] ?? m[2]).replace(/^\/+/, "") : null;
  } catch {
    return null;
  }
}
