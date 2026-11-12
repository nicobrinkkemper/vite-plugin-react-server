import { describe, it, expect } from "vitest";
import { dependencyImportsOf } from "../../plugin/bundle/hostDependencyClientModules.js";

describe("dependencyImportsOf", () => {
  it("lists the names imported from packages and leaves paths, builtins and types out", () => {
    expect(
      dependencyImportsOf(`
        import React, { useState } from "react";
        import { Box, Stack as VStack, type BoxProps } from '@scope/ui';
        import * as icons from "icons";
        import type { Theme } from "theme";
        import "side-effect";
        import { local } from "./local.js";
        import fs from "node:fs";
        import data from "/abs/data.js";
        import virtual from "virtual:thing";
      `)
    ).toEqual({
      react: ["default", "useState"],
      "@scope/ui": ["Box", "Stack"],
      icons: ["*"],
    });
  });
});
