import { spawnSync } from "node:child_process";

import { packageManagerInvocation } from "./package-manager.mjs";

const packageManager = packageManagerInvocation();
const result = spawnSync(
  packageManager.command,
  [...packageManager.args, "--filter", "@redrob/desktop", "build"],
  { stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
