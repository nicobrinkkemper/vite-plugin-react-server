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
  
    // Add page files using the file path as the key (not the normalized key)
    for (const [, value] of files.pageMap) {
      // Use the file path as the key so Vite can process it as an entry point
      if (!inputs[value]) {
        inputs[value] = value;
      } else {
        console.warn(`[RSC] Page file already exists: ${value}`);
      }
    }
  
    // Add props files using the file path as the key (not the normalized key)
    for (const [, value] of files.propsMap) {
      // Use the file path as the key so Vite can process it as an entry point
      if (!inputs[value]) {
        inputs[value] = value;
      } else {
        console.warn(`[RSC] Props file already exists: ${value}`);
      }
    }
  
    return inputs;
  };