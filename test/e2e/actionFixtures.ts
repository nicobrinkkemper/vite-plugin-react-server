/**
 * Install a minimal `/e2e-actions/` route whose props() reads persisted state
 * into the RSC payload. That is the surface the props()-cache regression needs:
 * a client that fetches its data after paint would not show a cached props()
 * result, so the list has to come through props().
 *
 * Teardown restores/deletes only slots that were successfully captured.
 */
import { rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  restoreAll,
  writeTracked,
  type CapturedFile,
} from "./safeFiles.js";
import {
  installServerActions,
  uninstallServerActions,
  type ServerActionFixtureHandle,
} from "./serverActionFixtures.js";

const PAGE_SOURCE = `import * as React from "react";
import { RemoveItemButton } from "../../components/E2ERemoveItem.client.js";
import type { Props } from "./props.js";

export function Page({ names }: Props) {
  return (
    <div>
      <h1>E2E Actions</h1>
      <ul data-testid="e2e-items">
        {names.map((name) => (
          <li key={name}>
            {name}{" "}
            <RemoveItemButton name={name} />
          </li>
        ))}
      </ul>
    </div>
  );
}
`;

const PROPS_SOURCE = `import { getItems } from "../../server/actions/e2eActions.server.js";

export const props = async () => {
  const names = await getItems();
  return { names };
};

export type Props = Awaited<ReturnType<typeof props>>;
`;

const REMOVE_BUTTON_SOURCE = `"use client";

import * as React from "react";
import { removeItem } from "../server/actions/e2eActions.server.js";

/** Deletes an item via a direct client→server-fn import. */
export function RemoveItemButton({ name }: { name: string }) {
  return (
    <button type="button" onClick={() => void removeItem(name)}>
      Delete
    </button>
  );
}
`;

export type ActionFixtureHandle = {
  slots: CapturedFile[];
  actions: ServerActionFixtureHandle;
};

export async function installActionFixtures(
  bidoofDir: string,
): Promise<ActionFixtureHandle> {
  const slots: CapturedFile[] = [];
  const actions = await installServerActions(bidoofDir);
  try {
    slots.push(
      await writeTracked(
        join(bidoofDir, "src/components/E2ERemoveItem.client.tsx"),
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
    await uninstallActionFixtures({ slots, actions }).catch((restoreErr: unknown) => {
      console.error(restoreErr);
    });
    throw err;
  }
  return { slots, actions };
}

export async function uninstallActionFixtures(
  handle: ActionFixtureHandle | undefined,
): Promise<void> {
  if (!handle) return;
  try {
    await restoreAll(handle.slots);
  } finally {
    await uninstallServerActions(handle.actions);
  }
  // Drop the route dir if we created it and it is now empty.
  const pageSlot = handle.slots.find((s) => s.path.endsWith(join("e2e-actions", "page.tsx")));
  if (pageSlot?.previous === null) {
    await rmdir(dirname(pageSlot.path)).catch(() => {});
  }
}
