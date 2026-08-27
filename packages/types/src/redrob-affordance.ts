import { z } from "zod"

export const REDROB_AFFORDANCE_SCHEMA_VERSION = 1

export const redrobAffordanceKindSchema = z.enum(["query", "command", "guidance"])
export type RedrobAffordanceKind = z.infer<typeof redrobAffordanceKindSchema>

export const redrobProviderKindSchema = z.enum(["builtin", "extension", "mcp", "connect"])
export type RedrobProviderKind = z.infer<typeof redrobProviderKindSchema>

export const redrobProviderRefSchema = z.object({
  id: z.string().trim().min(1),
  kind: redrobProviderKindSchema,
})
export type RedrobProviderRef = z.infer<typeof redrobProviderRefSchema>

export const redrobAffordanceArgumentSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(["string", "number", "boolean", "object", "array", "unknown"]),
  required: z.boolean(),
  description: z.string().trim().min(1).optional(),
})
export type RedrobAffordanceArgument = z.infer<typeof redrobAffordanceArgumentSchema>

export const redrobAffordanceEffectsSchema = z.object({
  data: z.enum(["none", "read", "write"]),
  ui: z.enum(["none", "focus", "navigate", "layout", "dialog"]),
  external: z.boolean(),
})
export type RedrobAffordanceEffects = z.infer<typeof redrobAffordanceEffectsSchema>

export const redrobAffordanceAvailabilitySchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().min(1).optional(),
})
export type RedrobAffordanceAvailability = z.infer<typeof redrobAffordanceAvailabilitySchema>

export const redrobAffordanceExecutorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("redrob") }),
  z.object({
    kind: z.literal("tool"),
    tool: z.string().trim().min(1),
  }),
])
export type RedrobAffordanceExecutor = z.infer<typeof redrobAffordanceExecutorSchema>

export const redrobAffordanceDescriptorSchema = z.object({
  id: z.string().trim().min(1),
  kind: redrobAffordanceKindSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  provider: redrobProviderRefSchema,
  arguments: z.array(redrobAffordanceArgumentSchema),
  effects: redrobAffordanceEffectsSchema,
  confirmation: z.enum(["never", "destructive", "always"]),
  availability: redrobAffordanceAvailabilitySchema,
  executor: redrobAffordanceExecutorSchema,
})
export type RedrobAffordanceDescriptor = z.infer<typeof redrobAffordanceDescriptorSchema>

export const redrobAffordanceRequestSchema = z.object({
  id: z.string().trim().min(1),
  args: z.record(z.string(), z.unknown()).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
  actor: z.string().trim().min(1).optional(),
})
export type RedrobAffordanceRequest = z.infer<typeof redrobAffordanceRequestSchema>

const redrobAffordanceSuccessSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
  result: z.unknown().optional(),
  revision: z.number().int().nonnegative().optional(),
  effects: redrobAffordanceEffectsSchema,
})

const redrobAffordanceFailureSchema = z.object({
  ok: z.literal(false),
  id: z.string(),
  error: z.string(),
  code: z.enum(["unavailable", "invalid-args", "conflict", "failed"]),
  revision: z.number().int().nonnegative().optional(),
})

export const redrobAffordanceResultSchema = z.discriminatedUnion("ok", [
  redrobAffordanceSuccessSchema,
  redrobAffordanceFailureSchema,
])
export type RedrobAffordanceResult = z.infer<typeof redrobAffordanceResultSchema>
