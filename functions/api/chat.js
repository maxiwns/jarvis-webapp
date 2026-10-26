
/**
 * JARVIS 0.9 – KI-Router
 * Kostenlose KI: Cloudflare Llama 3.1
 * GPT und Claude: für später vorbereitet
 *
 * Zugriffsschutz erfolgt über functions/_middleware.js.
 */

const BACKEND_URL =
  "https://jarvis-backend.maxiwiens.workers.dev";

const MODELS = {
  auto: {
    provider: "cloudflare",
    model: "llama-3.1"
  },
  llama: {
    provider: "cloudflare",
    model: "llama-3.1"
  }
};

function reply(data, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestPost({ request, env }) {
  const origin = new URL(request.url).origin;

  if (request.headers.get("Origin") !== origin) {
    return reply({ error: "Forbidden" }, 403);
  }

  if (!env.JARVIS_BACKEND_API_KEY) {
    return reply({ error: "Backend key missing" }, 503);
  }

  const type = request.headers.get("Content-Type") || "";

  if (!type.toLowerCase().startsWith("application/json")) {
    return reply({ error: "JSON required" }, 415);
  }

  const raw = await request.text();

  if (raw.length > 4000) {
    return reply({ error: "Request too large" }, 413);
  }

  let body;

  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid JSON" }, 400);
  }

  const message = body?.message;
  const requestedModel = body?.model || "auto";

  if (
    typeof message !== "string" ||
    message.trim().length < 5 ||
    message.length > 2000
  ) {
    return reply({ error: "Invalid message" }, 400);
  }

  // Nur kostenlose Modelle sind derzeit erlaubt.
  if (!Object.hasOwn(MODELS, requestedModel)) {
    return reply({
      error: "Model not enabled",
      message:
        "Dieses KI-Modell ist noch nicht freigeschaltet."
    }, 403);
  }

  const selected = MODELS[requestedModel];

  try {
    const result = await fetch(BACKEND_URL + "/api/plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization":
          "Bearer " + env.JARVIS_BACKEND_API_KEY
      },
      body: JSON.stringify({
        auftrag: message.trim()
      })
    });

    const data = await result.json();

    if (!result.ok) {
      return reply({
        error: "Backend request failed",
        backendStatus: result.status
      }, 502);
    }

    if (typeof data.plan !== "string") {
      return reply({
        error: "Invalid backend response"
      }, 502);
    }

    return reply({
      status: "success",
      model: selected.model,
      provider: selected.provider,
      reply: data.plan
    });

  } catch {
    return reply({
      error: "AI service unavailable"
    }, 502);
  }
}

export function onRequestGet() {
  return reply({
    status: "ready",
    version: "0.9",
    activeModel: "llama-3.1",
    models: {
      llama: "available",
      auto: "free-only",
      openai: "not-configured",
      claude: "not-configured",
      local: "not-configured"
    }
  });
}
