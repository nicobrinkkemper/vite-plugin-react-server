/**
 * Install / tear down e2e-owned client fixtures inside bidoof-template.
 *
 * The live demo is a Pokédex app and no longer ships Counter, counterStyles,
 * or ServerFnProbe. Specs that need Fast Refresh state, client-graph CSS HMR,
 * or a direct client→"use server" import install these files for the suite
 * duration and restore the demo afterwards.
 *
 * Teardown is gated on successful capture: a failed install never writes empty
 * originals back over existing demo sources.
 */
import { join } from "node:path";
import {
  captureFile,
  restoreFile,
  writeTracked,
  type CapturedFile,
} from "./safeFiles.js";

const COUNTER_SOURCE = `"use client";
import React from "react";
import styles from "../css/counterStyles.module.css";

export function Counter() {
  const [count, setCount] = React.useState<number>();
  return (
    <button className={styles["Counter"]} onClick={() => setCount((count ?? 0) + 1)}>
      Click count: {count ?? 0}
    </button>
  );
}
`;

const COUNTER_CSS = `/*
 * Client-graph CSS module: imported only by Counter.client.tsx.
 * Owned by the vprs e2e suite — installed for the run, removed on teardown.
 */
.Counter {
    color: rgb(255, 0, 0);
    font-weight: bold;
}
`;

const SERVER_FN_PROBE_SOURCE = `"use client";

import React, { useState } from "react";
// Direct client import of a "use server" module — the transport must resolve
// through vprs's virtual client module (no bare specifier in the browser).
import { getFavorites } from "../server/actions/favoriteActions.server.js";

export function ServerFnProbe() {
  const [count, setCount] = useState<number | null>(null);
  return (
    <button
      type="button"
      data-testid="server-fn-probe"
      onClick={async () => {
        const names = await getFavorites();
        setCount(names.length);
      }}
    >
      {count === null ? "Probe server fn" : \`server says: \${count} favorites\`}
    </button>
  );
}
`;

const FIXTURE_MARK = "/* vprs-e2e-client-fixtures */";

/**
 * Inject Counter + ServerFnProbe into the home page without replacing the
 * Pokédex composition. Idempotent when already patched.
 */
export function patchHomePage(source: string): string {
  if (source.includes(FIXTURE_MARK)) return source;

  let out = source;
  if (!out.includes('from "../components/Counter.client.js"')) {
    out = out.replace(
      /import type \{ Props \} from "\.\/props\.js";/,
      `import type { Props } from "./props.js";\n${FIXTURE_MARK}\nimport { Counter } from "../components/Counter.client.js";\nimport { ServerFnProbe } from "../components/ServerFnProbe.client.js";`,
    );
  }
  if (!out.includes("<Counter />")) {
    out = out.replace(
      "<h1>Pokédex</h1>",
      `<h1>Pokédex</h1>\n          <Counter />\n          <ServerFnProbe />`,
    );
  }
  if (!out.includes(FIXTURE_MARK) || !out.includes("<Counter />")) {
    throw new Error(
      "clientFixtures: failed to patch src/page/page.tsx — home page shape changed",
    );
  }
  return out;
}

export type ClientFixtureHandle = {
  slots: CapturedFile[];
};

/**
 * Write Counter / CSS / probe and patch the home page. Capture every target
 * before writing so teardown can restore accurately.
 */
export async function installClientFixtures(
  bidoofDir: string,
): Promise<ClientFixtureHandle> {
  const counterFile = join(bidoofDir, "src/components/Counter.client.tsx");
  const cssFile = join(bidoofDir, "src/css/counterStyles.module.css");
  const probeFile = join(bidoofDir, "src/components/ServerFnProbe.client.tsx");
  const pageFile = join(bidoofDir, "src/page/page.tsx");

  // Capture the page first (must exist); abort before any write if missing.
  const pageSlot = await captureFile(pageFile);
  if (pageSlot.previous === null) {
    throw new Error(`clientFixtures: missing home page at ${pageFile}`);
  }

  const slots: CapturedFile[] = [];
  try {
    slots.push(await writeTracked(counterFile, COUNTER_SOURCE));
    slots.push(await writeTracked(cssFile, COUNTER_CSS));
    slots.push(await writeTracked(probeFile, SERVER_FN_PROBE_SOURCE));

    const patched = patchHomePage(pageSlot.previous);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(pageFile, patched);
    slots.push(pageSlot);
  } catch (err) {
    // Roll back anything already written so a failed setup never leaves the
    // demo half-patched (and never truncates page.tsx with empty defaults).
    for (const slot of [...slots].reverse()) {
      await restoreFile(slot);
    }
    throw err;
  }

  return { slots };
}

/** Restore every successfully captured slot (created files deleted). */
export async function uninstallClientFixtures(
  handle: ClientFixtureHandle | undefined,
): Promise<void> {
  if (!handle) return;
  // Restore in reverse order so the page goes back before we delete imports.
  for (const slot of [...handle.slots].reverse()) {
    await restoreFile(slot);
  }
}
