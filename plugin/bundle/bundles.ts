// Vite 8 swaps Rollup→Rolldown; source bundle types from Vite's version-agnostic Rollup namespace.
import type { Rollup } from "vite";
type OutputBundle = Rollup.OutputBundle;

export const bundles = {
  server: null,
  client: null,
  static: null,
} as {
  server: OutputBundle | null;
  client: OutputBundle | null;
  static: OutputBundle | null;
};

export const addBundle =
  (name: "server" | "client" | "static") => (bundle: OutputBundle) => {
    bundles[name] = bundle;
  };

export const addStaticBundle = addBundle("static");

export const addClientBundle = addBundle("client");

export const addServerBundle = addBundle("server");
