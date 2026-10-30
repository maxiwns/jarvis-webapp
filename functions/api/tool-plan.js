
/*
 * JARVIS – Geschützte Werkzeugplanung
 * Verbindet die Webapp mit dem Backend.
 * Führt keine Werkzeuge aus.
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

  if (!contentType.toLowerCase().startsWith("application/json")) {
    return reply({ error: "JSON required" }, 415);
  }

  const raw = await request.text();

  if (raw.length > 10000) {
    return reply({ error: "Request too large" }, 413);
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }

  const instruction = body?.instruction;

  if (
    typeof instruction !== "string" ||
    instruction.trim().length < 5 ||
    instruction.length > 8000
  ) {
    return reply({ error: "Invalid instruction" }, 400);
  }

  try {
    const response = await fetch(
      BACKEND_URL + "/api/tool-plan",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization":
            "Bearer " + env.JARVIS_BACKEND_API_KEY
        },
        body: JSON.stringify({
          instruction: instruction.trim()
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return reply({
        error: "Tool planning failed",
        backendStatus: response.status
      }, 502);
    }

    if (
      data.success !== true ||
      !data.plan ||
      data.executed !== false
    ) {
      return reply({
        error: "Invalid tool plan response"
      }, 502);
    }

    return reply(data);

  } catch (error) {
    console.error(
      "JARVIS tool plan connection failed",
      error?.name || "Error"
    );

    return reply({
      error: "AI backend unavailable"
    }, 502);
  }
}
