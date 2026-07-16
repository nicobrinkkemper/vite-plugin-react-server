import { describe, it, expect, vi } from "vitest";
import {
  createVendoredPackageJsonPlugin,
  resolveVendoredPackageDir,
} from "../../plugin/environments/createVendoredPackageJsonPlugin.js";

describe("environments/resolveVendoredPackageDir", () => {
  it("returns null for output outside node_modules", () => {
    expect(resolveVendoredPackageDir("assets/index-a1b2.js")).toBeNull();
    expect(resolveVendoredPackageDir("src/page.js")).toBeNull();
  });

  it("resolves an unscoped package dir", () => {
    expect(
      resolveVendoredPackageDir("node_modules/vite-plugin-react-server/dist/link.js")
    ).toBe("node_modules/vite-plugin-react-server");
  });

  it("resolves a scoped package dir across both segments", () => {
    expect(
      resolveVendoredPackageDir("node_modules/@chakra-ui/react/dist/x.js")
    ).toBe("node_modules/@chakra-ui/react");
  });

  it("resolves the INNERMOST package for a nested dependency", () => {
    // Node consults the nearest parent package.json, so a nested dep's own
    // directory is the one that governs its chunks.
    expect(
      resolveVendoredPackageDir("node_modules/a/node_modules/b/dist/x.js")
    ).toBe("node_modules/a/node_modules/b");
  });

  it("returns null when there is no file below the package segments", () => {
    expect(resolveVendoredPackageDir("node_modules/pkg")).toBeNull();
    expect(resolveVendoredPackageDir("node_modules/@scope/pkg")).toBeNull();
  });
});

/** Minimal stand-in for the plugin context `generateBundle` runs under. */
const runGenerateBundle = (fileNames: string[]) => {
  const plugin = createVendoredPackageJsonPlugin();
  const bundle = Object.fromEntries(
    fileNames.map((f) => [f, { type: "chunk", fileName: f }])
  );
  const emitFile = vi.fn();
  const hook = plugin.generateBundle;
  const handler = typeof hook === "function" ? hook : hook?.handler;
  handler?.call({ emitFile } as never, {} as never, bundle as never, false);
  return emitFile;
};

describe("environments/createVendoredPackageJsonPlugin", () => {
  it("stamps one type:module package.json per vendored package", () => {
    const emitFile = runGenerateBundle([
      "node_modules/vite-plugin-react-server/dist/link.js",
      "node_modules/vite-plugin-react-server/dist/router-react.js",
      "node_modules/@chakra-ui/react/dist/x.js",
      "assets/index-a1b2.js",
    ]);

    expect(emitFile).toHaveBeenCalledTimes(2);
    const emitted = emitFile.mock.calls.map(([c]) => c.fileName);
    expect(emitted).toContain("node_modules/vite-plugin-react-server/package.json");
    expect(emitted).toContain("node_modules/@chakra-ui/react/package.json");
    expect(JSON.parse(emitFile.mock.calls[0][0].source)).toEqual({
      type: "module",
    });
  });

  it("emits nothing when no chunk lands under node_modules", () => {
    expect(runGenerateBundle(["assets/index-a1b2.js"])).not.toHaveBeenCalled();
  });

  it("does not clobber a package.json the build already emitted", () => {
    // The bundler throws on a duplicate fileName, so a real package.json in
    // the bundle must win.
    const emitFile = runGenerateBundle([
      "node_modules/pkg/dist/x.js",
      "node_modules/pkg/package.json",
    ]);
    expect(emitFile).not.toHaveBeenCalled();
  });
});
