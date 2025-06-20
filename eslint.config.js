import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";


export default defineConfig([
  {
    ignores: [
      "**/dist/**",
      "**/build/**", 
      "**/node_modules/**",
      "**/oss-experimental/**",
      "**/*.min.js",
      "**/coverage/**",
      "**/.vite/**",
      "**/test/fixtures/**",
      "**/test/fixtures/**"
    ]
  },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "react/prop-types": "off"  // Disable prop-types as we're using TypeScript
    }
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error", 
        { 
          "argsIgnorePattern": "^_", 
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ],
      "@typescript-eslint/prefer-namespace-keyword": "off",  // Disable namespace preference rule
      "@typescript-eslint/no-namespace": "off",  // Disable namespace rule since we use it for type augmentation
      "@typescript-eslint/consistent-type-imports": ["error", { "prefer": "type-imports" }],  // Prefer type imports
      "@typescript-eslint/no-explicit-any": "warn",  // Warn about any usage instead of error
      "@typescript-eslint/no-empty-object-type": "error",  // Prevent empty object types
      "prefer-const": "error",  // Enforce const for variables that aren't reassigned
      "no-useless-catch": "error",  // Prevent unnecessary try/catch wrappers
      "no-unused-vars": "off"  // Turn off the base rule as it can report incorrect errors
    }
  },
  {
    "settings": {
      "react": {
        "version": "detect"  // This will automatically detect your React version
      }
    }
  }
]);
