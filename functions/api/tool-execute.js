
/*
 * JARVIS – Geschützte Werkzeugausführung
 * Verbindet die angemeldete Webapp mit dem Backend.
 *
 * Testphase: Nur web_read und reports.
 */

const BACKEND_URL =
  "https://jarvis-backend.maxiwiens.workers.dev";

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);

  if (request.headers.get("Origin") !== url.origin) {
    return reply({ error: "Forbidden" }, 403);
  }

  if (!env.JARVIS_BACKEND_API_KEY) {
    return reply({ error: "Backend not configured" }, 503);
  }

  const contentType =
    request.headers.get("Content-Type") || "";

  if (!contentType.toLowerCase()
      .startsWith("application/json")) {
    return reply({ error: "JSON required" }, 415);
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 16000) {
      return reply({ error: "Request too large" }, 413);
    }

    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }

  const tool = body?.tool;
  const args = body?.args;

  if (
    !["web_read", "reports"].includes(tool) ||
    !args ||
    typeof args !== "object" ||
    Array.isArray(args)
  ) {
    return reply({ error: "Tool not permitted" }, 403);
  }

  try {
    const response = await fetch(
      BACKEND_URL + "/api/tool-execute",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            "Bearer " + env.JARVIS_BACKEND_API_KEY
        },
        body: JSON.stringify({ tool, args })
      }
    );

    const data = await response.json()
      .catch(() => ({}));

    return reply(
      data,
      response.status
    );

  } catch (error) {
    console.error(
      "JARVIS tool connection failed",
      error?.name || "Error"
    );

    return reply({
      error: "Tool backend unavailable"
    }, 502);
  }
}
