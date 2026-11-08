import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
// The tests that drive Chrome run last and one at a time: two Chromes at
// once, beside the rest of the spec, slow a CI runner past "about a second".
const CHROME = ["spec/two-windows.test.ts", "spec/layout.test.ts"];

export default defineConfig({
  test: {
    globalSetup: ["./spec/global-setup.ts"],
    projects: [
      { extends: true, test: { name: "app", include: ["spec/**/*.test.ts"], exclude: CHROME } },
      { extends: true, test: { name: "chrome", include: CHROME, fileParallelism: false, sequence: { groupOrder: 1 } } },
    ],
  },
});
