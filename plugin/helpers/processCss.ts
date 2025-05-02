// import type { CssContent } from "../types.js";
// import { DEFAULT_CONFIG } from "../config/defaults.js";
// import { createCssProps } from "./createCssProps.js";

// /**
//  * Processes CSS files to determine which ones should be inlined based on size and patterns.
//  * This function is used by both static and server plugins to ensure consistent CSS handling.
//  * 
//  * @param options Options for CSS processing
//  * @returns A Promise that resolves to an array of processed CSS files and used classes
//  */
// export async function processCss(options: {
//   cssFiles: Map<string, string | CssContent>;
//   inlineCss?: boolean;
//   inlineThreshold?: number;
//   inlinePatterns?: RegExp[];
//   linkPatterns?: RegExp[];
//   usedClasses?: Set<string>;
//   moduleExtension: RegExp;
// }): Promise<{
//   cssFiles: CssContent[];
//   usedClasses: Set<string>;
// }> {
//   const {
//     cssFiles,
//     inlineCss = false,
//     inlineThreshold = DEFAULT_CONFIG.CSS.inlineThreshold,
//     inlinePatterns = DEFAULT_CONFIG.CSS.inlinePatterns,
//     linkPatterns = DEFAULT_CONFIG.CSS.linkPatterns,
//     usedClasses = new Set<string>(),
//     moduleExtension = DEFAULT_CONFIG.MODULE_EXTENSION
//   } = options;

//   // Map CSS values and determine inlining
//   const processedFiles = await Promise.all(
//     Array.from(cssFiles.entries()).map(async ([path, value]) => {
//       const shouldInlineByPattern = inlinePatterns.some(pattern => pattern.test(path));
//       const shouldLinkByPattern = linkPatterns.some(pattern => pattern.test(path));
      
//       // If value is a CssContent object, use its proxy to get class names
//       if (typeof value !== 'string' && value.proxy) {
//         Object.keys(value.proxy).forEach(className => {
//           usedClasses.add(className);
//         });
//         return value;
//       }

//       // Create a new CssContent object
//       const cssContent: CssContent = createCssProps({
//         path,
//         css: {
//           inlineCss,
//           inlineThreshold,
//           inlinePatterns,
//       const cssContent: CssContent = createCssProps({
//       // Determine if this file should be inlined
//       const shouldInline = inlineCss && (
//         shouldInlineByPattern || 
//         (!shouldLinkByPattern)
//       );

//       if (shouldInline) {
//         cssContent.as = 'style';
//       } else {
//         cssContent.as = 'link';
//       }

//       return cssContent;
//     })
//   );

//   return {
//     cssFiles: processedFiles,
//     usedClasses
//   };
// } 