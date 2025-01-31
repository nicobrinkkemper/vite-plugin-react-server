import type { InlineConfig } from "vite";
import type { ResolvedUserConfig, ResolvedUserOptions } from "../types.js";
import type { InputOption } from "rollup";
import { mergeInputs } from "./mergeInputs.js";
import { createInputNormalizer } from "../helpers/inputNormalizer.js";

type CreateBuildConfigOptions = {
  input: InputOption;
  userOptions:  ResolvedUserOptions;
  userConfig: ResolvedUserConfig;
  root: string;
  moduleBaseExceptions: string[];
};


export function createBuildConfig({
  root,
  input,
  userOptions,
  userConfig,
  moduleBaseExceptions
}: CreateBuildConfigOptions) {
  const { output, input: inputConfig, ...restRollupOptions } =
    userConfig.build.rollupOptions ?? {};

  let mergedInputs = mergeInputs(input, inputConfig);

  let inputNormalizer = createInputNormalizer({
    root,
  });
  if(typeof mergedInputs === 'object' && mergedInputs != null) {
    mergedInputs = Object.fromEntries(Object.entries(mergedInputs).map(inputNormalizer));
  }
  const config: InlineConfig = {
    configFile: false,
    ...userConfig,
    build: {
      ...userConfig.build,
      rollupOptions: {
        input: mergedInputs,
        output: {
          format: "esm",
          preserveModules: true,
          hoistTransitiveImports: false,
          esModule: true,
          entryFileNames: "[name].js",
          chunkFileNames: "[name].js",
          assetFileNames: "[name][extname]",
          ...output,
        },
        ...restRollupOptions,
      },
    },
  };

  return config;
}
