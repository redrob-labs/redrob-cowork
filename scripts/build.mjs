import { execSync } from "node:child_process";

execSync("pnpm --filter @redrob/desktop build", { stdio: "inherit" });
