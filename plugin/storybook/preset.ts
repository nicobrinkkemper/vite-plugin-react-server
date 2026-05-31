import { createRequire } from "node:module";
import type { Plugin, UserConfig } from "vite";

// Storybook preset for vite-plugin-react-server apps.
//
// Add to .storybook/main.ts:
//   addons: ["vite-plugin-react-server/storybook"]
//
// It does the configuration every vprs-on-Storybook project would otherwise
// hand-roll: strip the vprs Vite plugin (it assumes RSC entry points and
// intercepts "/"), resolve the bare react-server-dom-esm/client.browser import
// that the RSC-client utilities emit, and silence the use-client/use-server
// directive warnings UI libraries trigger when bundled.

const require = createRequire(import.meta.url);

/**
 * Rewrites the bare `react-server-dom-esm/client.browser` import to the ESM
 * build this package hosts at
 * `vite-plugin-react-server/react-server-dom-esm/client.browser`.
 *
 * In a real app the vprs Vite plugin resolves the bare specifier; Storybook
 * strips that plugin, so without this the bare import is unresolvable —
 * react-server-dom-esm has no standalone npm package, it's vendored here. The
 * self-reference goes through this package's own exports map, so it honours the
 * dev/prod conditions and survives internal folder moves.
 */
function resolveReactServerDomEsm(): Plugin {
  return {
    name: "vite-plugin-react-server:storybook:resolve-rsd",
    enforce: "pre",
    resolveId(source) {
      if (source === "react-server-dom-esm/client.browser") {
        return require.resolve(
          "vite-plugin-react-server/react-server-dom-esm/client.browser",
        );
      }
      return null;
    },
  };
}

const VIRTUAL_RSC_HMR = "virtual:react-server/hmr";
const RESOLVED_VIRTUAL_RSC_HMR_STUB = "\0" + VIRTUAL_RSC_HMR + "?storybook-stub";

/**
 * Substitutes the `virtual:react-server/hmr` module with a no-op stub.
 *
 * The real provider lives in the vprs dev-server plugin (which Storybook
 * strips). Without a substitute, any consumer code that imports the virtual —
 * e.g. `useRscHmr` from `vite-plugin-react-server/utils/rsc-client` — leaves
 * a dangling specifier in the build. `storybook build` then emits a bundle
 * that does `import ... from "virtual:react-server/hmr"`, and the browser
 * fails to fetch the `virtual:` URL ("Cross origin requests are only
 * supported for protocol schemes…"), preventing the manager from booting.
 *
 * The earlier approach added the virtual to `rollupOptions.external`, but
 * `external` means "leave the import alone, the runtime provides it" — that
 * makes sense for `node:fs` in SSR, not for a `virtual:*` URL with no
 * browser-side provider. A resolve+load stub fixes both build (it resolves)
 * and runtime (the loaded module is a real, browser-safe no-op).
 *
 * Storybook stories never need RSC HMR — they don't talk to a vprs dev
 * server. No-op is the correct semantics, not a workaround.
 */
function stubVirtualRscHmr(): Plugin {
  return {
    name: "vite-plugin-react-server:storybook:stub-virtual-rsc-hmr",
    enforce: "pre",
    resolveId(source) {
      if (source === VIRTUAL_RSC_HMR) {
        return RESOLVED_VIRTUAL_RSC_HMR_STUB;
      }
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_RSC_HMR_STUB) {
        // Mirror the real virtual's export shape (see plugin/types/virtual-rsc-hmr.d.ts)
        // so any consumer of `virtual:react-server/hmr` continues to type-check
        // and tree-shake cleanly under Storybook.
        return [
          "export const RSC_HMR_EVENT = 'vite-plugin-react-server:server-component-update';",
          "export function useRscHmr() {}",
          "export function setupRscHmr() {}",
        ].join("\n");
      }
      return null;
    },
  };
}

/** Storybook `viteFinal` preset hook. */
export const viteFinal = async (config: UserConfig): Promise<UserConfig> => {
  const plugins = (config.plugins ?? []).filter((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) return true;
    const name = (p as { name?: string }).name ?? "";
    return !name.startsWith("vite-plugin-react-server");
  });

  const include = (config.optimizeDeps?.include ?? []).filter(
    (entry) => !entry.startsWith("react-server-dom-esm"),
  );

  const existingExternal = config.build?.rollupOptions?.external;
  // `virtual:react-server/hmr` used to live here; see `stubVirtualRscHmr` for
  // why externalizing a virtual specifier was the wrong shape.
  const external = Array.isArray(existingExternal) ? existingExternal : [];

  const prevOnwarn = config.build?.rollupOptions?.onwarn;

  return {
    ...config,
    plugins: [resolveReactServerDomEsm(), stubVirtualRscHmr(), ...plugins],
    optimizeDeps: { ...config.optimizeDeps, include },
    build: {
      ...config.build,
      rollupOptions: {
        ...config.build?.rollupOptions,
        external,
        // Any library shipping "use client"/"use server" directives (Chakra,
        // Ark, MUI, …) triggers a MODULE_LEVEL_DIRECTIVE warning per file when
        // bundled — meaningless in Storybook, which has no RSC runtime. Silence
        // just those; preserve a consumer's existing onwarn. UI-lib-agnostic.
        onwarn(warning, defaultHandler) {
          if (
            warning.code === "MODULE_LEVEL_DIRECTIVE" &&
            typeof warning.message === "string" &&
            /use (client|server)/.test(warning.message)
          ) {
            return;
          }
          if (typeof prevOnwarn === "function") {
            prevOnwarn(warning, defaultHandler);
            return;
          }
          defaultHandler(warning);
        },
      },
    },
  };
};
