import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig, globalIgnores } from "eslint/config";

// Lint checks correctness, not layout: formatting rules are deprecated in core
// ESLint, and the code follows neither them nor .prettierrc.mjs today.
export default defineConfig([
  globalIgnores(["build/", "dist/", "out/", "coverage/", ".plasmo/"]),
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], languageOptions: { globals: globals.browser } },
  // Node scripts and tool configs run in Node, not the extension.
  { files: ["scripts/**", "*.config.*", "**/*.cjs"], languageOptions: { globals: globals.node } },
  tseslint.configs.recommended,
  pluginReact.configs.flat.recommended,
  { settings: { react: { version: "detect" } } },
  // TypeScript itself checks undefined names and component props.
  { files: ["**/*.{ts,mts,cts,tsx}"], rules: { "no-undef": "off", "react/prop-types": "off" } },
  // Tool configs load their plugins with require().
  { files: ["*.config.*"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  {
    rules: {
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/consistent-type-assertions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-explicit-any": "off",
      // A leading underscore marks a name that is unused on purpose; so does a
      // key destructured only to leave it out of a ...rest copy.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", ignoreRestSiblings: true }]
    },
  }
]);
