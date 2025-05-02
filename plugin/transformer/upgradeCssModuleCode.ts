/**
 * Upgrades CSS module code to track class usage.
 * 
 * This function modifies the CSS module exports to track which classes are actually used.
 * It adds a proxy around the exports that records class usage in a global Set.
 * 
 * @param code The original CSS module code from Vite
 * @returns The upgraded CSS module code with tracking
 */
export function upgradeCssModuleCode(code: string): string {
  // Check if this is a CSS module export
  if (code.includes('export default')) {
    // Add tracking code to the CSS module exports
    return code.replace(
      /export default ({[\s\S]*?})/,
      (match: string, exports: string) => {
        return `
          const originalExports = ${exports};
          const trackedExports = {};
          
          // Create a proxy to track class usage
          Object.keys(originalExports).forEach(key => {
            Object.defineProperty(trackedExports, key, {
              get: function() {
                // Track that this class was used
                if (typeof window !== 'undefined') {
                  window.__cssModuleClassesUsed = window.__cssModuleClassesUsed || new Set();
                  window.__cssModuleClassesUsed.add(key);
                }
                return originalExports[key];
              }
            });
          });
          
          export default trackedExports;
        `;
      }
    );
  }
  
  return code;
} 