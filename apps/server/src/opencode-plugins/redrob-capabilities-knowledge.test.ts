import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { RedrobWorkCapabilitiesKnowledge } from "./redrob-capabilities-knowledge.js";

describe("Redrob Work capabilities knowledge plugin", () => {
  test("injects local capability guidance without control-plane instructions", async () => {
    const plugin = await RedrobWorkCapabilitiesKnowledge();
    const output = { system: [] };

    await plugin["experimental.chat.system.transform"]({}, output);

    const knowledge = output.system.join("\n");
    expect(knowledge).toContain("Redrob Work documentation tools answer product questions. Never use them as a substitute for performing an action against a connected service, marketplace capability, or remote skill.");
    expect(knowledge).toContain("Settings > Library");
    expect(knowledge).toContain("Settings > Debug");
    expect(knowledge).toContain("REDROB_API_KEY");
    expect(knowledge).toContain("Skill creation:");
    expect(knowledge).toContain("Memory Bank");

    // Nothing may steer the agent at a control plane that no longer exists.
    expect(knowledge).not.toContain("api.redrob.io/mcp/agent");
    expect(knowledge).not.toContain("app.redrob.io");
    expect(knowledge).not.toContain("Redrob Work Cloud");
    expect(knowledge).not.toContain("Redrob Work Connect");
    expect(knowledge).not.toContain("Automations");
    expect(knowledge).not.toContain("sign in to Redrob Work");
  });

  test("retrieves Slack connection guidance from bundled docs", async () => {
    process.env.REDROB_DOCS_DIR = resolve(import.meta.dir, "../../../../packages/docs");

    const plugin = await RedrobWorkCapabilitiesKnowledge();
    const search = await plugin.tool.redrob_docs_search.execute({ query: "how can i connect slack", limit: 3 });

    expect(search).toContain("start-here/connect-your-stack/connect-slack-mcp.mdx");
    expect(search).toContain("Connect Slack as a custom MCP");

    const read = await plugin.tool.redrob_docs_read.execute({
      path: "start-here/connect-your-stack/connect-slack-mcp.mdx",
    });

    expect(read).toContain("https://mcp.slack.com/mcp");
    expect(read).toContain("Advanced OAuth");
    expect(read).toContain("http://127.0.0.1:19876/mcp/oauth/callback");
    expect(read).toContain("search:read.public");
  });

  test("does not expose the retired local skill import guide", async () => {
    process.env.REDROB_DOCS_DIR = resolve(import.meta.dir, "../../../../packages/docs");

    const plugin = await RedrobWorkCapabilitiesKnowledge();
    const search = await plugin.tool.redrob_docs_search.execute({ query: "import a skill", limit: 10 });

    expect(search).not.toContain("start-here/do-work-with-it/import-a-skill.mdx");
  });

  test("cannot surface the retired hosted Cloud pages", async () => {
    process.env.REDROB_DOCS_DIR = resolve(import.meta.dir, "../../../../packages/docs");

    const plugin = await RedrobWorkCapabilitiesKnowledge();
    // The docs search tool indexes the whole bundled tree, so a surviving cloud/
    // page is enough for an agent to describe features the product does not have.
    const search = await plugin.tool.redrob_docs_search.execute({ query: "cloud organization sso scim collections", limit: 10 });

    expect(search).not.toContain("\"cloud/");
    expect(search).not.toContain("Redrob Work Cloud");
  });
});

describe("bundled docs tree", () => {
  const docsDir = resolve(import.meta.dir, "../../../../packages/docs");

  test("no longer ships the hosted Cloud product pages", async () => {
    expect(existsSync(join(docsDir, "cloud"))).toBe(false);
    // self-host deploy guides are a different thing and must survive.
    expect(existsSync(join(docsDir, "self-host", "deploy-to-your-cloud", "overview.mdx"))).toBe(true);
  });

  test("navigation and redirects contain no cloud product pages", async () => {
    const docs = JSON.parse(await readFile(join(docsDir, "docs.json"), "utf8")) as {
      navigation: unknown;
      redirects?: { source: string; destination: string }[];
    };

    expect(navigationPageIds(docs.navigation).filter((id) => id.startsWith("cloud/"))).toEqual([]);
    expect((docs.redirects ?? []).filter((entry) => entry.destination.startsWith("/cloud/"))).toEqual([]);
  });

  test("every navigation page resolves to a bundled file", async () => {
    const docs = JSON.parse(await readFile(join(docsDir, "docs.json"), "utf8")) as { navigation: unknown };
    const missing = navigationPageIds(docs.navigation).filter((id) => !existsSync(join(docsDir, `${id}.mdx`)));

    expect(missing).toEqual([]);
  });
});

function navigationPageIds(navigation: unknown): string[] {
  if (typeof navigation === "string") return [navigation];
  if (Array.isArray(navigation)) return navigation.flatMap(navigationPageIds);
  if (!navigation || typeof navigation !== "object") return [];
  return Object.entries(navigation)
    .filter(([key]) => key === "tabs" || key === "groups" || key === "pages")
    .flatMap(([, value]) => navigationPageIds(value));
}
