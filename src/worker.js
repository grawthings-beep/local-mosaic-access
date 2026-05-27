export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/mosaic" && request.method === "POST") {
      return proxyApi(request, env, "/mosaic");
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return proxyApi(request, env, "/health");
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ ok: false, error: "Not found" }, 404);
    }

    return env.ASSETS.fetch(request);
  },
};

async function proxyApi(request, env, path) {
  const apiBase = (env.MOSAIC_API_URL || "").trim();
  if (!apiBase) {
    return json(
      {
        ok: false,
        error: "MOSAIC_API_URL is not configured",
      },
      503,
    );
  }

  const upstreamUrl = new URL(path, apiBase.endsWith("/") ? apiBase : `${apiBase}/`);
  const headers = new Headers();
  const contentType = request.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);

  const token = (env.MOSAIC_API_TOKEN || "").trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const upstreamRequest = new Request(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  });

  const upstreamResponse = await fetch(upstreamRequest);
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.set("Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
