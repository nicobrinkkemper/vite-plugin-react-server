import type { ResolvedBuildPages } from "../../types.js";

/**
 * Logic to add page and prop files to the inputs, without extra prefix
 * @param param0 
 * @returns 
 */
export const pageAndPropFiles = ({
    files,
    inputs,
  }: {
    files: ResolvedBuildPages | undefined;
    inputs: Record<string, string>;
  }) => {
    if (!files) return inputs;
  
    // Add page files without extra prefix
    for (const [key, value] of files.pageMap) {
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Page file already exists: ${key}`);
      }
    }
  
    // Add props files without extra prefix
    for (const [key, value] of files.propsMap) {
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Props file already exists: ${key}`);
      }
    }
  
    return inputs;
  };