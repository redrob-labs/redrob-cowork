import { z } from "zod"

import {
  redrobAffordanceDescriptorSchema,
  redrobProviderRefSchema,
} from "./redrob-affordance.js"

export const redrobGuidanceDescriptorSchema = z.object({
  ref: z.string().trim().min(1),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  provider: redrobProviderRefSchema,
  loading: z.enum(["eager", "catalog", "on-demand"]),
})
export type RedrobGuidanceDescriptor = z.infer<typeof redrobGuidanceDescriptorSchema>

export const redrobFeatureContributionSchema = z.object({
  featureId: z.string().trim().min(1),
  provider: redrobProviderRefSchema,
  affordances: z.array(redrobAffordanceDescriptorSchema),
  guidance: z.array(redrobGuidanceDescriptorSchema),
})
export type RedrobFeatureContribution = z.infer<typeof redrobFeatureContributionSchema>

export const redrobProviderCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  contributions: z.array(redrobFeatureContributionSchema),
})
export type RedrobProviderCatalog = z.infer<typeof redrobProviderCatalogSchema>

export const redrobCapabilityResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("completed"),
    data: z.unknown(),
    additionalContext: z.array(z.string()).optional(),
  }),
  z.object({
    status: z.literal("guidance"),
    instructions: z.array(z.string()),
  }),
  z.object({
    status: z.literal("requires-user-action"),
    message: z.string(),
    action: z.string().optional(),
  }),
  z.object({
    status: z.literal("failed"),
    error: z.string(),
    retryable: z.boolean(),
  }),
])
export type RedrobCapabilityResult = z.infer<typeof redrobCapabilityResultSchema>
