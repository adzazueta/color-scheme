import { defineConfig, type ViteUserConfig } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

// Annotated (not exported inline) so a plain `tsc --noEmit` accepts it under `isolatedDeclarations`.
const config: ViteUserConfig = defineConfig({
  resolve: { tsconfigPaths: true },
  pack: {
    entry: { index: "src/index.ts" },
    format: "esm",
    platform: "neutral",
    fixedExtension: false,
    dts: true,
    publint: { level: "warning", strict: true },
    attw: { profile: "esm-only", level: "error" },
  },
  test: {
    coverage: {
      provider: "v8",
      enabled: false,
      include: ["src/**"],
      reporter: ["text-summary", "json-summary"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["test/node/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }, { browser: "firefox" }, { browser: "webkit" }],
          },
        },
      },
    ],
  },
  lint: {
    ignorePatterns: ["dist/**", "coverage/**"],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: [
      "dist/**",
      "coverage/**",
      "pnpm-lock.yaml",
      // Written by `changeset version` in the version pull request, which nothing formats: its
      // generator indents the blank lines of a multi-line entry with two spaces.
      "CHANGELOG.md",
    ],
  },
  staged: {
    "*": "vp check --no-error-on-unmatched-pattern",
  },
});

export default config;
