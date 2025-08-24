import type { Manifest } from "vite";

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
    manifests[name] = manifest;
  };

export const addStaticManifest = addManifest("static");
export const addClientManifest = addManifest("client");
export const addServerManifest = addManifest("server");
