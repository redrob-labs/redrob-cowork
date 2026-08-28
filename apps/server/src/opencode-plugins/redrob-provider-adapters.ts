import type {
  RedrobAffordanceArgument,
  RedrobAffordanceDescriptor,
  RedrobAffordanceEffects,
  RedrobProviderRef,
} from "@redrob/types/redrob-affordance";
import type {
  RedrobFeatureContribution,
  RedrobGuidanceDescriptor,
} from "@redrob/types/redrob-provider";

export type EngineMcpDescriptor = {
  name: string;
  status?: string;
};

const noEffects: RedrobAffordanceEffects = {
  data: "none",
  ui: "none",
  external: false,
};
const readEffects: RedrobAffordanceEffects = {
  data: "read",
  ui: "none",
  external: false,
};
const writeEffects: RedrobAffordanceEffects = {
  data: "write",
  ui: "none",
  external: false,
};

function argument(
  name: string,
  type: RedrobAffordanceArgument["type"],
  required: boolean,
  description: string,
): RedrobAffordanceArgument {
  return { name, type, required, description };
}

function affordance(input: {
  id: string;
  kind: "query" | "command";
  title: string;
  description: string;
  provider: RedrobProviderRef;
  arguments?: RedrobAffordanceArgument[];
  effects?: RedrobAffordanceEffects;
  tool?: string;
}): RedrobAffordanceDescriptor {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    description: input.description,
    provider: input.provider,
    arguments: input.arguments ?? [],
    effects: input.effects ?? noEffects,
    confirmation: "never",
    availability: { enabled: true },
    executor: input.tool
      ? { kind: "tool", tool: input.tool }
      : { kind: "redrob" },
  };
}

function sessionContribution(): RedrobFeatureContribution {
  const provider: RedrobProviderRef = { id: "redrob-server", kind: "builtin" };
  return {
    featureId: "sessions",
    provider,
    affordances: [
      affordance({
        id: "session.search",
        kind: "query",
        title: "Find sessions",
        description: "Search session titles and transcripts without changing the visible workbench.",
        provider,
        arguments: [
          argument("query", "string", true, "Text to find in session titles or messages."),
          argument("workspaceId", "string", false, "Optional workspace id or name."),
        ],
        effects: readEffects,
      }),
      affordance({
        id: "session.read",
        kind: "query",
        title: "Read a session transcript",
        description: "Read recent messages from a session without opening it.",
        provider,
        arguments: [
          argument("sessionId", "string", true, "Session id returned by session.search."),
          argument("workspaceId", "string", false, "Optional workspace id or name."),
          argument("count", "number", false, "Number of recent messages to return."),
        ],
        effects: readEffects,
      }),
      affordance({
        id: "session.create",
        kind: "command",
        title: "Create sessions",
        description: "Create and start one or more sessions without navigating away.",
        provider,
        arguments: [argument("sessions", "array", true, "Session titles and self-contained prompts.")],
        effects: writeEffects,
      }),
    ],
    guidance: [],
  };
}

function extensionContribution(): RedrobFeatureContribution {
  const provider: RedrobProviderRef = { id: "redrob-extensions", kind: "extension" };
  return {
    featureId: "extensions",
    provider,
    affordances: [
      affordance({
        id: "extension.actions",
        kind: "query",
        title: "List extension actions",
        description: "List actions exposed by enabled local Redrob Work extensions.",
        provider,
        arguments: [argument("extensionId", "string", false, "Optional extension id.")],
        effects: readEffects,
      }),
      affordance({
        id: "extension.call",
        kind: "command",
        title: "Call an extension action",
        description: "Execute one action exposed by a local Redrob Work extension.",
        provider,
        arguments: [
          argument("extensionId", "string", true, "Extension id."),
          argument("action", "string", true, "Action id returned by extension.actions."),
          argument("args", "object", false, "Extension action arguments."),
        ],
        effects: { data: "write", ui: "none", external: true },
      }),
    ],
    guidance: [],
  };
}

function mcpContribution(mcp: EngineMcpDescriptor): RedrobFeatureContribution {
  return {
    featureId: `mcp:${mcp.name}`,
    provider: { id: mcp.name, kind: "mcp" },
    affordances: [],
    guidance: [],
  };
}

export function buildRedrobProviderContributions(
  mcps: EngineMcpDescriptor[] = [],
): RedrobFeatureContribution[] {
  return [
    sessionContribution(),
    extensionContribution(),
    ...mcps.map(mcpContribution),
  ];
}
