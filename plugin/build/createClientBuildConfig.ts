import { mergeInputsAsync } from "./mergeInputs.js";
import type { createBuildConfigFn } from "../types.js";


export const createClientBuildConfig: createBuildConfigFn<'react-client'> = async ({
  userConfig,
  inputNormalizer
}) => {
  const { input: inputConfig, ...restRollupOptions } = userConfig.build.rollupOptions ?? {};
  
  return {
    ...userConfig,
    build: {
      ...userConfig.build,
      rollupOptions: {
        ...restRollupOptions,
        input: await mergeInputsAsync({}, inputConfig, inputNormalizer),
      }
    }
  };
};