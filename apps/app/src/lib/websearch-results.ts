export interface WebSearchResult {
  title: string
  url: string
  description?: string
  /** The source's publish date when the search provider gives one (ISO date). */
  publishedAt?: string
}

const TITLE_PATTERN = /^Title:\s*(.+)$/m
const URL_PATTERN = /^URL:\s*(https?:\/\/\S+)$/m
const HIGHLIGHTS_PATTERN = /(?:^|\n)Highlights:\s*([\s\S]*?)(?:\n\[\.\.\.\]|$)/

/** A URL's host without a leading "www.", or null when the URL does not parse. */
export function hostnameOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/**
 * The engine's current web search returns JSON - { results: [{ url, title, publish_date,
 * excerpts }] } (Parallel provider, seen live) - where the older provider returned "Title: / URL: /
 * Highlights:" blocks. Both shapes are read; anything else gives no results.
 */
function parseJsonResults(output: string): WebSearchResult[] | null {
  const text = output.trim()
  if (!text.startsWith("{") && !text.startsWith("[")) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const list = Array.isArray(parsed) ? parsed : (parsed as { results?: unknown })?.results
  if (!Array.isArray(list)) return null
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const record = entry as { url?: unknown; title?: unknown; excerpts?: unknown; publish_date?: unknown }
    const url = typeof record.url === "string" ? record.url.trim() : ""
    const host = url ? hostnameOf(url) : null
    if (!host) return []
    const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : host
    const excerpt = Array.isArray(record.excerpts) && typeof record.excerpts[0] === "string" ? record.excerpts[0].trim() : undefined
    const publishedAt = typeof record.publish_date === "string" && record.publish_date ? record.publish_date : undefined
    return [{ title, url, ...(excerpt ? { description: excerpt } : {}), ...(publishedAt ? { publishedAt } : {}) }]
  })
}

/** The sources a web search returned, from either output shape; anything that is not a string gives none. */
export function parseWebSearchResults(output: unknown): WebSearchResult[] {
  if (typeof output !== "string") return []
  const json = parseJsonResults(output)
  if (json) return json
  return output.split(/\n---\n/).flatMap((block) => {
    const title = block.match(TITLE_PATTERN)?.[1]?.trim()
    const url = block.match(URL_PATTERN)?.[1]?.trim()
    const description = block.match(HIGHLIGHTS_PATTERN)?.[1]?.trim()

    if (!url) {
      return []
    }

    try {
      return [
        {
          title: title && title !== "N/A" ? title : new URL(url).hostname,
          url,
          description,
        },
      ]
    } catch {
      return []
    }
  })
}
