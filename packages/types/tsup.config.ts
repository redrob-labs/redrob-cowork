import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
      "redrob-affordance": "src/redrob-affordance.ts",
    "redrob-context": "src/redrob-context.ts",
    "redrob-provider": "src/redrob-provider.ts",
    "automations": "src/automations.ts",
    workflows: "src/workflows.ts",
    "skill-created-app": "src/skill-created-app.ts",
      "plugin-flow-app": "src/plugin-flow-app.ts",
                },
  tsconfig: "./tsconfig.json",
  format: ["esm"],
  dts: {
    tsconfig: "./tsconfig.json",
  },
  clean: true,
  target: "es2022",
  platform: "neutral",
  sourcemap: false,
  splitting: false,
  treeshake: true,
  external: ["zod"],
})
