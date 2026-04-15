import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  platform: "node",
  outDir: "dist",
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  // @inquirer/core contains CJS transitive deps (yoctocolors-cjs, mute-stream)
  // that call require() on Node built-ins at load time. Bundling them into
  // ESM triggers "Dynamic require not supported" at runtime. Keeping the
  // package external lets Node load it as a proper CJS/ESM module.
  external: ["@inquirer/core"],
});
