#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import packageJSON from "../package.json" with { type: "json" };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Hardcoded template version from our last successful patch
const TEMPLATE_VERSION = "0.0.0-experimental-0ca8420f-20250504";
const [_templateVersionNumber, templateVersionSuffix] = TEMPLATE_VERSION.split("-experimental-");

// Get installed version
const installedVersion = React.version;
const [_installedVersionNumber, installedVersionSuffix] = installedVersion.split("-experimental-");

// Get peer dependency versions
const peerReactVersion = packageJSON.peerDependencies.react.replace("^", "");
const peerReactESMVersion = packageJSON.peerDependencies["react-server-dom-esm"].replace("^", "");

console.log('Template version:', TEMPLATE_VERSION);
console.log('Installed version:', installedVersion);
console.log('Peer version:', peerReactVersion);
console.log('ESM version (for final patch):', peerReactESMVersion);

// Define patches to process
const patches = [
  {
    // The template patch file uses our experimental version
    template: path.resolve(
      __dirname,
      `react-server-dom-esm+${TEMPLATE_VERSION}.patch`
    ),
    // But the final patch file uses the ESM version
    output: `react-server-dom-esm+${peerReactESMVersion}.patch`,
  },
];

// Create patches dir
const userPatchesDir = path.resolve(process.cwd(), "patches");

/**
 * The script checks if the installed React version is 19.2.0.
 * If it is, it will replace the version number in react-server-dom-esm+0.0.1.patch
 * with the current React version, such as 0.0.0.experimental-e5dd82a7-20250401
 *
 * @returns Promise<void>
 */
async function main() {
  if (templateVersionSuffix === installedVersionSuffix) {
    console.log("React version is already patched", TEMPLATE_VERSION, installedVersion);
    return;
  }
  await fs.mkdir(userPatchesDir, { recursive: true });

  // Process each patch
  for (const { template, output } of patches) {
    const patchContent = await fs.readFile(template, "utf-8");
    // Write patched file
    const outputPath = path.resolve(userPatchesDir, output);
    await fs.writeFile(outputPath, patchContent);
    console.log(`Wrote patch file to ${outputPath}`);
  }
}

try {
  await main();
} catch (error) {
  console.error("error applying patch", error);
}
