import { env } from "../env.js"

export function redrobYourConnectionsUrl(connectionId: string) {
  const url = new URL("/dashboard/your-connections", env.betterAuthUrl)
  url.searchParams.set("connectionId", connectionId)
  return url.toString()
}

export function redrobOrganizationConnectionsUrl() {
  return new URL("/dashboard/mcp-connections", env.betterAuthUrl).toString()
}
