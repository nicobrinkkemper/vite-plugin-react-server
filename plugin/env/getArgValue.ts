/**
 * Helper function to parse command-line arguments in both formats:
 * --arg value (space-separated) and --arg=value (equals-separated)
 * Handles Vite CLI patterns including short forms, optional arguments, and duplicates
 * Based on Vite's CLI implementation patterns
 */
export function getArgValue(argName: string, shortForm?: string): string | undefined {
  const args = process.argv;
  const foundValues: string[] = [];

  // Check for --arg=value format first (all occurrences)
  for (const arg of args) {
    if (arg.startsWith(`--${argName}=`)) {
      const value = arg.substring(`--${argName}=`.length);
      foundValues.push(value);
    }
    // Also check short form if provided
    if (shortForm && arg.startsWith(`-${shortForm}=`)) {
      const value = arg.substring(`-${shortForm}=`.length);
      foundValues.push(value);
    }
  }

  // Check for --arg value format (space-separated)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Check long form
    if (arg === `--${argName}`) {
      // If this is the last argument or next argument starts with -, 
      // then this is a boolean flag or optional argument without value
      if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
        foundValues.push("");
      } else {
        foundValues.push(args[i + 1]);
      }
    }
    
    // Check short form if provided  
    if (shortForm && arg === `-${shortForm}`) {
      if (i + 1 >= args.length || args[i + 1].startsWith("-")) {
        foundValues.push("");
      } else {
        foundValues.push(args[i + 1]);
      }
    }
  }

  // Return undefined if no values found
  if (foundValues.length === 0) {
    return undefined;
  }

  // Like Vite's filterDuplicateOptions, take the last value when there are duplicates
  return foundValues[foundValues.length - 1];
}
