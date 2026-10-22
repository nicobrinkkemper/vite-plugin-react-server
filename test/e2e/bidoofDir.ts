/**
 * Resolve the bidoof-template demo used as the Playwright fixture host.
 *
 * The classic `../../../bidoof-template` relative path only works from the
 * primary checkout (`~/code/vite-plugin-react-server`). Git worktrees live
 * elsewhere (e.g. mission-control `local/dispatch/<id>`), so we prefer the
 * sibling of the primary checkout via `git rev-parse --git-common-dir`, then
 * fall back to the relative layout, then `$BIDOOF_TEMPLATE`.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function fromGitCommonDir(): string | undefined {
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: here,
      encoding: "utf8",
    }).trim();
    const mainRepo = dirname(resolve(here, common));
    const sibling = resolve(mainRepo, "../bidoof-template");
    return existsSync(join(sibling, "package.json")) ? sibling : undefined;
  } catch {
    return undefined;
  }
}

function fromRelativeLayout(): string | undefined {
  const candidate = resolve(here, "../../../bidoof-template");
  return existsSync(join(candidate, "package.json")) ? candidate : undefined;
}

function fromEnv(): string | undefined {
  const env = process.env.BIDOOF_TEMPLATE;
  if (!env) return undefined;
  const candidate = resolve(env);
  return existsSync(join(candidate, "package.json")) ? candidate : undefined;
}

/** Absolute path to the linked demo fixture root. */
export function resolveBidoofDir(): string {
  const dir = fromEnv() ?? fromGitCommonDir() ?? fromRelativeLayout();
  if (!dir) {
    throw new Error(
      "bidoof-template not found. Set BIDOOF_TEMPLATE or place it as a sibling of the primary vite-plugin-react-server checkout.",
    );
  }
  return dir;
}
