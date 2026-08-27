import { describe, expect, test } from "bun:test"

import { attributeChatToolError } from "../src/components/tools/error-attribution"
import { normalizeErrorText } from "../src/lib/error-text"

describe("chat tool error attribution", () => {
  test("identifies an Redrob Work-created capability deadline", () => {
    expect(attributeChatToolError("The capability call exceeded 180s. Retry once.")).toEqual({
      label: "Redrob Work timeout",
      confidence: "Confirmed",
      description: "Redrob Work created this deadline. The external operation may still have completed, so verify its state before retrying.",
    })
  })

  test("identifies a structured Redrob Work lifecycle deadline", () => {
    expect(attributeChatToolError(JSON.stringify({
      error: "connection_failed",
      diagnostic: {
        code: "MCP_LIFECYCLE_DEADLINE",
        category: "lifecycle_deadline",
        phase: "MCP_TOOL_EXECUTION",
      },
    }))).toMatchObject({
      label: "Redrob Work timeout",
      confidence: "Confirmed",
    })
  })

  test("identifies an Redrob Work block before send", () => {
    expect(attributeChatToolError(JSON.stringify({
      diagnostic: { code: "MCP_URL_BLOCKED", category: "security_blocked" },
    }))).toMatchObject({
      label: "Blocked by Redrob Work",
      confidence: "Confirmed",
    })
  })

  test("identifies a remote MCP HTTP failure", () => {
    expect(attributeChatToolError(`MCP error: ${JSON.stringify({
      diagnostic: { code: "MCP_HTTP_504", httpStatus: 504 },
    })} (tool execution failed)`)).toMatchObject({
      label: "Remote MCP · HTTP 504",
      confidence: "Confirmed",
    })
  })

  test("identifies a provider failure returned through the remote MCP", () => {
    expect(attributeChatToolError(JSON.stringify({
      diagnostic: { phase: "PROVIDER_AUTHORIZATION", providerStatus: 403 },
    }))).toMatchObject({
      label: "Provider error",
      confidence: "Confirmed",
      description: "The remote MCP responded, but the downstream provider returned status 403.",
    })
  })

  test("identifies provider attribution from a deploy-skew category and code", () => {
    expect(attributeChatToolError(JSON.stringify({
      diagnostic: { category: "provider_policy_denied", providerCode: "access_denied" },
    }))).toMatchObject({
      label: "Provider error",
      confidence: "Confirmed",
    })
  })

  test("does not claim ownership for an unstructured timeout", () => {
    expect(attributeChatToolError("Tool request timed out while waiting for a response.")).toEqual({
      label: "Timeout · source unclear",
      confidence: "Inferred",
      description: "A timeout was reported, but the client did not receive structured evidence identifying which boundary created it.",
    })
  })

  test("does not add attribution without useful evidence", () => {
    expect(attributeChatToolError("The tool failed.")).toBeNull()
  })

  test("bails out quickly on a pathological HTML page", () => {
    const htmlError = `<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>${"x".repeat(1_024 * 1_024)}</body></html>`
    const started = performance.now()

    expect(attributeChatToolError(htmlError)).toBeNull()
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  test("keeps JSON-head attribution after surrounding error text is clamped", () => {
    const diagnostic = JSON.stringify({
      error: "connection_failed",
      diagnostic: { code: "MCP_HTTP_504", httpStatus: 504 },
    })
    const unclamped = `MCP error: ${diagnostic} (tool execution failed)`
    const clamped = normalizeErrorText(`${unclamped}\n${"provider detail ".repeat(1_000)}`, { cap: 512 }).display

    expect(clamped).toContain(diagnostic)
    expect(attributeChatToolError(clamped)).toEqual(attributeChatToolError(unclamped))
  })

})
