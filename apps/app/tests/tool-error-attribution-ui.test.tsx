import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { DynamicToolUIPart } from "ai"

import { Tool } from "../src/components/ui/tool"

test("renders compact MCP attribution in a failed chat tool row", () => {
  const toolPart: DynamicToolUIPart = {
    type: "dynamic-tool",
    toolName: "notion_execute_capability",
    toolCallId: "call-1",
    state: "output-error",
    input: {},
    errorText: JSON.stringify({
      error: "connection_failed",
      diagnostic: { code: "MCP_HTTP_504", httpStatus: 504 },
    }),
  }

  const html = renderToStaticMarkup(<Tool toolPart={toolPart} />)

  expect(html).toContain("Remote MCP · HTTP 504")
  expect(html).toContain("Error attribution: Remote MCP · HTTP 504. Confirmed.")
  expect(html).not.toContain(">failed<")
})

test("renders a copy action inside the expanded tool result", () => {
  const toolPart: DynamicToolUIPart = {
    type: "dynamic-tool",
    toolName: "notion_search_capabilities",
    toolCallId: "call-copy",
    state: "output-available",
    input: { query: "Notion pages" },
    output: { matches: [{ name: "searchPages" }] },
  }

  const html = renderToStaticMarkup(<Tool toolPart={toolPart} defaultOpen />)
  const contentIndex = html.indexOf('data-slot="collapsible-content"')
  const copyActionIndex = html.indexOf('data-testid="tool-result-copy-action"')

  expect(contentIndex).toBeGreaterThan(-1)
  expect(copyActionIndex).toBeGreaterThan(contentIndex)
  expect(html).toContain('aria-label="Copy tool result"')
})

test("does not render a copy action before a tool has a result", () => {
  const toolPart: DynamicToolUIPart = {
    type: "dynamic-tool",
    toolName: "notion_search_capabilities",
    toolCallId: "call-running",
    state: "input-available",
    input: { query: "Notion pages" },
  }

  const html = renderToStaticMarkup(<Tool toolPart={toolPart} />)

  expect(html).not.toContain('data-testid="tool-result-copy-action"')
})
