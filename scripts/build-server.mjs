import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { packageManagerInvocation, resolveBunExecutable } from "./package-manager.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptsDir, "..");
const serverRoot = resolve(repoRoot, "apps", "server");
const packageManager = packageManagerInvocation();

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.error) {
    console.error(`[build-server] Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(
  packageManager.command,
  [...packageManager.args, "--filter", "@redrob/enterprise-mcp-client", "build"],
  repoRoot,
);
// The route labeller is imported by the compiled server at runtime, so its dist has to exist first.
run(
  packageManager.command,
  [...packageManager.args, "--filter", "@redrob-labs/route-labeller", "build"],
  repoRoot,
);
run(
  packageManager.command,
  [...packageManager.args, "--filter", "redrob-server", "exec", "tsc", "-p", "tsconfig.json"],
  repoRoot,
);
run(
  resolveBunExecutable(),
  [
    "build",
    "src/opencode-plugins/redrob-extensions-preview.ts",
    "src/opencode-plugins/redrob-capabilities-knowledge.ts",
    "src/opencode-plugins/redrob-office-attachments.ts",
    "src/opencode-plugins/redrob-anthropic-adaptive-thinking.ts",
    "src/opencode-plugins/redrob-anthropic-tool-schema.ts",
    "src/opencode-plugins/redrob-team-connectors.ts",
    "src/opencode-plugins/redrob-privacy-gate.ts",
    "src/opencode-plugins/redrob-route-labels.ts",
    "--outdir",
    "dist/opencode-plugins",
    "--target",
    "node",
    "--format",
    "esm",
  ],
  serverRoot,
);
