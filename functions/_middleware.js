
import { verifySession } from "./_lib/session.js";

const PUBLIC_PATHS = new Set([
  "/login",
  "/login.html",
  "/api/login",
  "/api/me",
  "/api/health"
]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (PUBLIC_PATHS.has(path)) {
    return context.next();
  }

  const authenticated = await verifySession(
    context.request,
    context.env
  );

  if (!authenticated) {
    if (path === "/api" || path.startsWith("/api/")) {
      return Response.json(
        { error: "Unauthorized" },
        {
          status: 401,
          headers: { "Cache-Control": "no-store" }
        }
      );
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: new URL("/login.html", url.origin).toString(),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  }

  const response = await context.next();
  const headers = new Headers(response.headers);

  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
