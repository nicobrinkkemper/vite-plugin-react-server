/**
 * A "use server" module owned by the e2e suite, with the state it persists.
 *
 * The specs that exercise server functions pin plugin behaviour, so they keep
 * their own function instead of leaning on the demo's actions, database and
 * schema. The state file sits outside the source tree: a write reaches the page
 * through the next action or render, never through HMR.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { restoreAll, writeTracked, type CapturedFile } from "./safeFiles.js";

const INITIAL_ITEMS = ["alpha", "beta", "gamma"];

const actionsSource = (stateFile: string) => `"use server";
import { readFile, writeFile } from "node:fs/promises";

const stateFile = ${JSON.stringify(stateFile)};

export async function getItems(): Promise<string[]> {
  return JSON.parse(await readFile(stateFile, "utf8"));
}

export async function removeItem(name: string): Promise<void> {
  const items = await getItems();
  await writeFile(stateFile, JSON.stringify(items.filter((item) => item !== name)));
}
`;

export type ServerActionFixtureHandle = {
  slots: CapturedFile[];
  stateDir: string;
  stateFile: string;
};

export async function installServerActions(
  bidoofDir: string,
): Promise<ServerActionFixtureHandle> {
  const stateDir = await mkdtemp(join(tmpdir(), "vprs-e2e-actions-"));
  const stateFile = join(stateDir, "items.json");
  const handle: ServerActionFixtureHandle = { slots: [], stateDir, stateFile };
  try {
    await writeItems(handle, INITIAL_ITEMS);
    handle.slots.push(
      await writeTracked(
        join(bidoofDir, "src/server/actions/e2eActions.server.ts"),
        actionsSource(stateFile),
      ),
    );
  } catch (err) {
    await uninstallServerActions(handle).catch((restoreErr: unknown) => {
      console.error(restoreErr);
    });
    throw err;
  }
  return handle;
}

export async function uninstallServerActions(
  handle: ServerActionFixtureHandle | undefined,
): Promise<void> {
  if (!handle) return;
  try {
    await restoreAll(handle.slots);
  } finally {
    await rm(handle.stateDir, { recursive: true, force: true });
  }
}

export async function writeItems(
  handle: ServerActionFixtureHandle,
  items: string[],
): Promise<void> {
  await writeFile(handle.stateFile, JSON.stringify(items));
}

export async function readItems(handle: ServerActionFixtureHandle): Promise<string[]> {
  return JSON.parse(await readFile(handle.stateFile, "utf8"));
}
