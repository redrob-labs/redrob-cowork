export const dynamic = "force-static"

const linkset = {
  linkset: [
    {
      anchor: "https://api.redrob.io",
      "service-desc": [
        {
          href: "https://api.redrob.io/openapi.json",
          type: "application/vnd.oai.openapi+json;version=3.1",
          title: "OpenWork Den API — OpenAPI 3.1 document",
        },
      ],
      "service-doc": [
        {
          href: "https://redrob.io/docs/api-reference",
          type: "text/html",
          title: "OpenWork Den API — human documentation",
        },
      ],
      status: [
        {
          href: "https://api.redrob.io/health",
          type: "application/json",
          title: "OpenWork Den API — health endpoint",
        },
      ],
      "service-meta": [
        {
          href: "https://redrob.io/llms.txt",
          type: "text/plain",
          title: "OpenWork llms.txt — agent-facing site guide",
        },
      ],
    },
  ],
}

export function GET() {
  return new Response(JSON.stringify(linkset, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/linkset+json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
