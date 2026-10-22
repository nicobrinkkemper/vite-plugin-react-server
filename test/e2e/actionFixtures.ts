/**
 * Install a minimal `/e2e-actions/` route whose props() reads the favorites
 * DB into the RSC payload. That is the surface the props()-cache regression
 * needs: FavoriteButton alone fetches favorites from the client after paint,
 * so a cached props() result would not hide a stale list from it.
 *
 * Teardown restores/deletes only slots that were successfully captured.
 */
import { join } from "node:path";
import {
  restoreFile,
  writeTracked,
  type CapturedFile,
} from "./safeFiles.js";

const PAGE_SOURCE = `import * as React from "react";
import { RemoveFavoriteButton } from "../../components/E2ERemoveFavorite.client.js";
import type { Props } from "./props.js";

export function Page({ names }: Props) {
  return (
    <div>
      <h1>E2E Actions</h1>
      <ul>
        {names.map((name) => (
          <li key={name}>
            {name}{" "}
            <RemoveFavoriteButton name={name} />
          </li>
        ))}
      </ul>
    </div>
  );
}
`;

const PROPS_SOURCE = `import { getFavorites } from "../../server/actions/favoriteActions.server.js";

export const props = async () => {
  const names = await getFavorites();
  return { names };
};

export type Props = Awaited<ReturnType<typeof props>>;
`;

const REMOVE_BUTTON_SOURCE = `"use client";

import * as React from "react";
import { toggleFavorite } from "../server/actions/favoriteActions.server.js";

/** Deletes (or re-adds) a favorite via a direct client→server-fn import. */
export function RemoveFavoriteButton({ name }: { name: string }) {
  return (
    <button type="button" onClick={() => void toggleFavorite(name)}>
      Delete
    </button>
  );
}
`;

export type ActionFixtureHandle = {
  slots: CapturedFile[];
};

export async function installActionFixtures(
  bidoofDir: string,
): Promise<ActionFixtureHandle> {
  const slots: CapturedFile[] = [];
  try {
    slots.push(
      await writeTracked(
        join(bidoofDir, "src/components/E2ERemoveFavorite.client.tsx"),
        REMOVE_BUTTON_SOURCE,
      ),
    );
    slots.push(
      await writeTracked(
        join(bidoofDir, "src/page/e2e-actions/page.tsx"),
        PAGE_SOURCE,
      ),
    );
    slots.push(
      await writeTracked(
        join(bidoofDir, "src/page/e2e-actions/props.ts"),
        PROPS_SOURCE,
      ),
    );
  } catch (err) {
    for (const slot of [...slots].reverse()) {
      await restoreFile(slot);
    }
    throw err;
  }
  return { slots };
}

export async function uninstallActionFixtures(
  handle: ActionFixtureHandle | undefined,
): Promise<void> {
  if (!handle) return;
  for (const slot of [...handle.slots].reverse()) {
    await restoreFile(slot);
  }
  // Drop the route dir if we created it and it is now empty.
  const pageSlot = handle.slots.find((s) => s.path.endsWith(`${join("e2e-actions", "page.tsx")}`));
  if (pageSlot?.previous === null) {
    const { rmdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await rmdir(dirname(pageSlot.path)).catch(() => {});
  }
}
