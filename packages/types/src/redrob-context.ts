import { z } from "zod"

import {
  redrobAffordanceDescriptorSchema,
  redrobProviderRefSchema,
} from "./redrob-affordance.js"
import { redrobFeatureContributionSchema } from "./redrob-provider.js"

export const REDROB_CONTEXT_SCHEMA_VERSION = 1

export const redrobSessionRefSchema = z.object({
  workspaceId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  title: z.string().optional(),
})
export type RedrobSessionRef = z.infer<typeof redrobSessionRefSchema>

export const redrobScreenSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("conversation"),
    route: z.string(),
    workspaceId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("settings"),
    route: z.string(),
    workspaceId: z.string().optional(),
    panel: z.string(),
  }),
  z.object({
    kind: z.literal("other"),
    route: z.string(),
  }),
])
export type RedrobScreen = z.infer<typeof redrobScreenSchema>

export const redrobConversationLayoutSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("empty") }),
  z.object({
    kind: z.literal("single"),
    sessionId: z.string(),
  }),
  z.object({
    kind: z.literal("split"),
    primarySessionId: z.string(),
    secondarySessionId: z.string(),
    focused: z.enum(["primary", "secondary"]),
  }),
])
export type RedrobConversationLayout = z.infer<typeof redrobConversationLayoutSchema>

export const redrobPanelTabSchema = z.object({
  id: z.string(),
  kind: z.enum(["browser", "artifact"]),
  label: z.string(),
  url: z.string().optional(),
  status: z.enum(["loading", "ready"]).optional(),
})
export type RedrobPanelTab = z.infer<typeof redrobPanelTabSchema>

export const redrobResourceDescriptorSchema = z.object({
  ref: z.string().trim().min(1),
  kind: z.enum(["workspace", "session", "screen", "side-panel", "settings"]),
  title: z.string(),
  provider: redrobProviderRefSchema,
  state: z.record(z.string(), z.unknown()),
})
export type RedrobResourceDescriptor = z.infer<typeof redrobResourceDescriptorSchema>

export const redrobContextSnapshotSchema = z.object({
  schemaVersion: z.literal(REDROB_CONTEXT_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  capturedAt: z.string(),
  screen: redrobScreenSchema,
  conversations: z.object({
    tabs: z.array(redrobSessionRefSchema),
    layout: redrobConversationLayoutSchema,
  }),
  chrome: z.object({
    sidebarOpen: z.boolean(),
    applicationMenuVisible: z.boolean(),
    rightSidebarExpanded: z.boolean(),
  }),
  execution: z.object({
    queries: z.literal("parallel"),
    commands: z.literal("serialized"),
    busyCommandId: z.string().nullable(),
    busyActor: z.string().nullable(),
  }),
  sidePanel: z.object({
    open: z.boolean(),
    ownerSessionId: z.string().nullable(),
    kind: z.enum(["panel", "extensions", "voice"]).nullable(),
    tabs: z.array(redrobPanelTabSchema),
    activeTabId: z.string().nullable(),
  }),
  resources: z.array(redrobResourceDescriptorSchema),
  availableAffordances: z.array(redrobAffordanceDescriptorSchema),
  contributions: z.array(redrobFeatureContributionSchema),
})
export type RedrobContextSnapshot = z.infer<typeof redrobContextSnapshotSchema>
