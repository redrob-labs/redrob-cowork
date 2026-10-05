import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { DsStory } from "../src/react-app/desk/ds-story";

const appRootPath = fileURLToPath(new URL("../src/react-app/shell/app-root.tsx", import.meta.url));
const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));

describe("design system 1.1 in the renderer", () => {
  test("pins @redrob-labs/ui exactly at 1.1.0", () => {
    const pkg: unknown = JSON.parse(readFileSync(packagePath, "utf8"));
    const deps = typeof pkg === "object" && pkg !== null && "dependencies" in pkg ? pkg.dependencies : null;
    const version = typeof deps === "object" && deps !== null && "@redrob-labs/ui" in deps ? deps["@redrob-labs/ui"] : null;
    expect(version).toBe("1.1.0");
  });

  test("the story renders the 1.1 components the Desk screens need", () => {
    const html = renderToStaticMarkup(<DsStory />);
    for (const root of ["rr-shell", "rr-composer", "rr-cmode", "rr-plandoc", "rr-factcheck", "rr-theme", "rr-menu"]) {
      expect(html).toContain(root);
    }
  });

  test("the story route exists only in development builds", () => {
    const source = readFileSync(appRootPath, "utf8");
    expect(source).toMatch(/import\.meta\.env\.DEV \? <Route path="\/__ds"/);
  });
});
