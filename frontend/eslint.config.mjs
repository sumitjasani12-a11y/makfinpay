import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly", document: "readonly", console: "readonly",
        localStorage: "readonly", fetch: "readonly", setTimeout: "readonly",
        clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
        process: "readonly", Buffer: "readonly", URL: "readonly",
        navigator: "readonly", FormData: "readonly", File: "readonly", FileReader: "readonly",
        XMLHttpRequest: "readonly", Image: "readonly", alert: "readonly",
        confirm: "readonly", prompt: "readonly", Blob: "readonly", URLSearchParams: "readonly",
        location: "readonly", history: "readonly", sessionStorage: "readonly",
        IntersectionObserver: "readonly", ResizeObserver: "readonly", MutationObserver: "readonly",
        requestAnimationFrame: "readonly", cancelAnimationFrame: "readonly",
        atob: "readonly", btoa: "readonly", crypto: "readonly", AbortController: "readonly",
      }
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": "off",
      "no-undef": "off",
    }
  }
];
