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
  
    // Add page files using the normalized key from pageMap
    for (const [key, value] of files.pageMap) {
      // Use the normalized key so Vite can process it correctly
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Page file already exists: ${key}`);
      }
    }
  
    // Add props files using the normalized key from propsMap
    for (const [key, value] of files.propsMap) {
      // Use the normalized key so Vite can process it correctly
      if (!inputs[key]) {
        inputs[key] = value;
      } else {
        console.warn(`[RSC] Props file already exists: ${key}`);
      }
    }
  
    return inputs;
  };