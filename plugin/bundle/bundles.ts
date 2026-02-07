import type { OutputBundle } from "rollup";

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
