import type { Manifest } from "vite";
import { perEnvironmentState } from "vite";

// Shared state between environments using Vite's perEnvironmentState API
const createSharedManifestStore = perEnvironmentState<{
  server: Manifest | null;
  client: Manifest | null;
  static: Manifest | null;
}>(() => ({
  server: null,
  client: null,
  static: null,
}));

// Legacy export for backward compatibility
export const manifests = {
  server: null,
  client: null,
  static: null,
} as {
  server: Manifest | null;
  client: Manifest | null;
  static: Manifest | null;
};

export const addManifest =
  (name: "server" | "client" | "static") => (manifest: Manifest) => {
    // Update the legacy manifests
    manifests[name] = manifest;
  };

export const addStaticManifest = addManifest("static");
export const addClientManifest = addManifest("client");
export const addServerManifest = addManifest("server");

// New function to get the shared state directly (requires plugin context)
export const getSharedManifestStore = (context: any) => createSharedManifestStore(context);

// New function to update shared state (requires plugin context)
export const updateSharedManifest = (context: any, name: "server" | "client" | "static", manifest: Manifest) => {
  try {
    const sharedState = createSharedManifestStore(context);
    sharedState[name] = manifest;
  } catch (error) {
    console.warn(`[manifests] Could not update shared state for ${name}: ${error}`);
  }
};
