// Note: do not import Node-only modules here (e.g., 'node:worker_threads').
// This file is consumed in both server and client plugin contexts.

import { proc } from "../proc.js";

/**
 * The two React resolution conditions vprs cares about. Named so call sites can
 * reference REACT_CONDITION.server / .client instead of the bare string
 * literals scattered across the codebase.
 */
export const REACT_CONDITION = {
  server: "react-server",
  client: "react-client",
} as const;

export type ReactCondition =
  (typeof REACT_CONDITION)[keyof typeof REACT_CONDITION];

/**
 * Tokenizes NODE_OPTIONS string into individual arguments.
 * Tokens split on unquoted whitespace only; a quoted segment stays attached
 * to the token it appears in (Node semantics: quotes protect spaces, so
 * `--conditions="react-server"` is ONE token, `--require "./my path/x.js"`
 * is two).
 */
const tokenizeNodeOptions = (): string[] => {
  const nodeOptions = proc?.env?.["NODE_OPTIONS"] || "";
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
      } else {
        current += char;
      }
    } else {
      if (char === '"' || char === "'") {
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
        conditions.push(
          ...conditionValue
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        );
        i++; // Skip the next argument since we consumed it
      }
    } else if (arg.startsWith("--conditions=")) {
      // Condition value is part of the same argument
      const conditionValue = arg.substring("--conditions=".length);
      conditions.push(
        ...conditionValue
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      );
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
  const { conditions: cliConditions } = parseNodeArgs(proc?.execArgv ?? []);

  // Combine all conditions
  return [...envConditions, ...cliConditions];
};

// ----------------------------------------------------------------------------
// Ambiguity detection and warning
// ----------------------------------------------------------------------------
let didWarnAmbiguousConditions = false;
// react-static does not exists, because you still need condition react-server for the .static imports to work.
const reactConditionSet = new Set<string>([
  REACT_CONDITION.server,
  REACT_CONDITION.client,
]);

export const detectReactConditionAmbiguity = (): string[] => {
  const conditions = getAllConditions();
  const found = conditions.filter((c) => reactConditionSet.has(c));
  const unique = Array.from(new Set(found));
  return unique;
};

export const warnIfAmbiguousReactConditions = (): void => {
  if (didWarnAmbiguousConditions) return;
  const unique = detectReactConditionAmbiguity();
  if (unique.includes("react-server") && unique.includes("react-client")) {
    didWarnAmbiguousConditions = true;
    const nodeOptions = proc?.env?.["NODE_OPTIONS"] || "";
    const argv = (proc?.execArgv ?? []).join(" ");
    const msg =
      `Both react-server and react-client conditions detected in NODE_OPTIONS/execArgv. ` +
      `This can lead to ambiguous resolution. Found: [${unique.join(", ")}]\n` +
      `NODE_OPTIONS="${nodeOptions}"\nexecArgv="${argv}"\n` +
      `Tip: set exactly one condition or let the plugin manage worker conditions.`;
    // Use process.emitWarning to avoid throwing
    try {
      proc?.emitWarning?.(msg, {
        code: "VPRS_CONDITION_AMBIGUITY",
        detail: "vite-plugin-react-server detected conflicting conditions",
      } as any);
    } catch {
      // Fallback

      console.warn(`[vite-plugin-react-server] ${msg}`);
    }
  }
};

/**
 * Gets the current condition, defaulting to "react-client" if no conditions are set
 */
export const getCurrentCondition = ():
  | "react-server"
  | "react-client"
  | undefined => {
  // Warn if we detect both conditions present
  warnIfAmbiguousReactConditions();

  // Check both NODE_OPTIONS and execArgv for conditions
  const conditions = getAllConditions();
  if (conditions.includes("react-server")) return "react-server";
  if (conditions.includes("react-client")) return "react-client";

  // Default to react-client when nothing is set
  return undefined;
};

/**
 * Gets the condition with a custom prefix
 */
export const getCondition = <Prefix extends string = "react-", DefaultCondition extends `${Prefix}${string}` = `${Prefix}client`>(
  prefix: Prefix = "react-" as Prefix,
  defaultReturn:
    | `${Prefix}server`
    | `${Prefix}client` = `${prefix}client` as `${Prefix}client`
): `${Prefix}client` | `${Prefix}server` | DefaultCondition => {
  const condition = getCurrentCondition();
  if (condition === REACT_CONDITION.server) {
    return `${prefix}server` as `${Prefix}server`;
  }
  if (condition === REACT_CONDITION.client) {
    return `${prefix}client` as `${Prefix}client`;
  }
  return defaultReturn;
};

/**
 * Asserts that the current condition is react-server
 * Throws an error with a descriptive message if not
 */
export function assertReactServer(): asserts this is {
  condition: "react-server";
} {
  const currentCondition = getCurrentCondition();
  if (currentCondition !== REACT_CONDITION.server) {
    // Debug-only: avoid Node-only APIs to keep this file browser-safe
    console.warn(
      `[vite-plugin-react-server] Condition mismatch: expected react-server. Set NODE_OPTIONS="--conditions=react-server"`
    );
    return; // Don't throw — Vite 7 may load both condition variants during config bundling
  }
}

export function assertNonReactServer(): asserts this is {
  condition: "react-client";
} {
  const currentCondition = getCurrentCondition();
  if (currentCondition === REACT_CONDITION.server) {
    // Debug-only: avoid Node-only APIs to keep this file browser-safe
    console.warn(
      `[vite-plugin-react-server] Condition mismatch: unexpected react-server condition on this module.`
    );
    return; // Don't throw — Vite 7 may load both condition variants during config bundling
  }
}

/**
 * Checks if the current condition is react-server (strict - requires both NODE_OPTIONS and execArgv)
 * Use this for React Server DOM compatibility checks
 */
export const isReactServerCondition = (): boolean =>
  getCurrentCondition() === REACT_CONDITION.server;

/**
 * Checks if the current condition is react-client (strict - requires both NODE_OPTIONS and execArgv)
 * Use this for React Server DOM compatibility checks
 */
export const isReactClientCondition = (): boolean =>
  getCurrentCondition() === REACT_CONDITION.client;

/**
 * Checks if react-server condition is present in either NODE_OPTIONS OR execArgv (lenient)
 * Use this for plugin internal environment gating
 */
export const hasReactServerCondition = (): boolean => {
  const allConditions = getAllConditions();
  return allConditions.includes("react-server");
};

/**
 * Checks if react-client condition is present in either NODE_OPTIONS OR execArgv (lenient)
 * Use this for plugin internal environment gating  
 */
export const hasReactClientCondition = (): boolean => {
  const allConditions = getAllConditions();
  return allConditions.includes("react-client");
};

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
