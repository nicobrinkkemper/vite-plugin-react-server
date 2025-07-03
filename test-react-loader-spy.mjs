// Spy loader to intercept module transformations
const transformedModules = new Map();

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  
  // Record the source for files in our test directory
  if (url.includes('test-react-loader-reexports') && result.source) {
    const source = typeof result.source === 'string' 
      ? result.source 
      : new TextDecoder().decode(result.source);
    
    transformedModules.set(url, source);
    console.log(`[SPY] Captured transformation for ${url}`);
  }
  
  return result;
}

export async function resolve(specifier, context, nextResolve) {
  return nextResolve(specifier, context);
}

// Export for access from test
export function getTransformedModules() {
  return transformedModules;
} 