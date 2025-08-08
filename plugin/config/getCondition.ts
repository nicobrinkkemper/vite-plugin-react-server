/**
 * Tokenizes NODE_OPTIONS string into individual arguments
 * Handles quoted strings, spaces, and special characters
 */
const tokenizeNodeOptions = (): string[] => {
  const nodeOptions = process.env["NODE_OPTIONS"] || "";
  if (!nodeOptions.trim()) {
    return [];
  }

  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";
  let i = 0;

  while (i < nodeOptions.length) {
    const char = nodeOptions[i];
    
    if (inQuotes) {
      if (char === quoteChar) {
        inQuotes = false;
        quoteChar = "";
        if (current.trim()) {
          tokens.push(current.trim());
          current = "";
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
        if (current.trim()) {
          tokens.push(current.trim());
          current = "";
        }
        inQuotes = true;
        quoteChar = char;
      } else if (char === " " || char === "\t" || char === "\n") {
        if (current.trim()) {
          tokens.push(current.trim());
          current = "";
        }
      } else {
        current += char;
      }
    }
    i++;
  }

  if (current.trim()) {
    tokens.push(current.trim());
  }

  return tokens.filter(Boolean);
};

/**
 * Parses command-line arguments for conditions and other flags
 */
const parseNodeArgs = (args: string[]) => {
  const conditions: string[] = [];
  const flags = new Set<string>();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === "--conditions" || arg === "-C") {
      // Next argument is the condition value
      if (i + 1 < args.length) {
        const conditionValue = args[i + 1];
        conditions.push(...conditionValue.split(',').map(c => c.trim()).filter(Boolean));
        i++; // Skip the next argument since we consumed it
      }
    } else if (arg.startsWith("--conditions=")) {
      // Condition value is part of the same argument
      const conditionValue = arg.substring("--conditions=".length);
      conditions.push(...conditionValue.split(',').map(c => c.trim()).filter(Boolean));
    } else if (arg === "--no-addons") {
      flags.add("no-addons");
    } else if (arg.startsWith("--")) {
      // Other flags
      flags.add(arg);
    }
  }

  return { conditions, flags };
};

/**
 * Gets all conditions from both NODE_OPTIONS and command-line arguments
 */
export const getAllConditions = (): string[] => {
  // Parse NODE_OPTIONS
  const nodeOptionsTokens = tokenizeNodeOptions();
  const { conditions: envConditions } = parseNodeArgs(nodeOptionsTokens);
  
  // Parse command-line arguments
  const { conditions: cliConditions } = parseNodeArgs(process.execArgv);
  
  // Combine all conditions
  return [...envConditions, ...cliConditions];
};

/**
 * Gets the current condition, defaulting to "react-client" if no conditions are set
 */
export const getCurrentCondition = (): "react-server" | "react-client" => {
  const conditions = getAllConditions();
  // Check if react-server is explicitly set
  if (conditions.includes("react-server")) {
    return "react-server";
  }
  
  // Default to react-client
  return "react-client";
};

/**
 * Gets the condition with a custom prefix
 */
export const getCondition = <Prefix extends string = "react-">(
  prefix: Prefix = "react-" as Prefix
): `${Prefix}client` | `${Prefix}server` => {
  const currentCondition = getCurrentCondition();
  return currentCondition === "react-server"
    ? (`${prefix}server` as `${Prefix}server`)
    : (`${prefix}client` as `${Prefix}client`);
};

/**
 * Asserts that the current condition is react-server
 * Throws an error with a descriptive message if not
 */
export function assertReactServer(): asserts this is { condition: "react-server" } {
  const currentCondition = getCurrentCondition();
  if (currentCondition !== "react-server") {
    throw new Error(
      `Condition mismatch, should be react-server but got ${currentCondition === "react-client" ? "client" : currentCondition}`
    );
  }
}

export function assertNonReactServer(): asserts this is { condition: "react-client" } {
  const currentCondition = getCurrentCondition();
  if (currentCondition === "react-server") {
    throw new Error(  
      `Condition mismatch, should be non react-server but got "react-server"`
    );
  }
}

/**
 * Checks if the current condition is react-server
 */
export const isReactServerCondition = (): boolean => 
  getCurrentCondition() === "react-server";

/**
 * Checks if the current condition is react-client
 */
export const isReactClientCondition = (): boolean =>
  getCurrentCondition() === "react-client";

/**
 * Legacy function for backward compatibility
 * @deprecated Use getAllConditions() instead
 */
export const getNodeOptionsConditions = (): string[] => {
  const nodeOptionsTokens = tokenizeNodeOptions();
  const { conditions } = parseNodeArgs(nodeOptionsTokens);
  return conditions;
};

/**
 * Legacy export for backward compatibility
 * @deprecated Use getCurrentCondition() instead
 */
export const condition = getCurrentCondition();
