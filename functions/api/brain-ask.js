
/*
 * JARVIS Second Brain – Fragen beantworten
 *
 * Sucht in Cloudflare D1 nach Wissen
 * und lässt Workers AI eine Antwort erstellen.
 *
 * Authentifizierung durch _middleware.js.
 */

const BACKEND =
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
  const origin = request.headers.get("Origin");
  const expectedOrigin = new URL(request.url).origin;

  if (
    (origin && origin !== expectedOrigin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  ) {
    return reply({
      success: false,
      error: "Origin not permitted"
    }, 403);
  }

  if (!env.DB || !env.JARVIS_BACKEND_API_KEY) {
    return reply({
      success: false,
      error: "Second Brain unavailable"
    }, 503);
  }

  const contentType =
    request.headers.get("Content-Type") || "";

  if (
    !contentType.toLowerCase()
      .startsWith("application/json")
  ) {
    return reply({
      success: false,
      error: "JSON required"
    }, 415);
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 4000) {
      return reply({
        success: false,
        error: "Request too large"
      }, 413);
    }

    body = JSON.parse(raw);
  } catch {
    return reply({
      success: false,
      error: "Invalid JSON"
    }, 400);
  }

  const question = body?.question;

  if (
    typeof question !== "string" ||
    question.trim().length < 3 ||
    question.length > 1000
  ) {
    return reply({
      success: false,
      error: "Invalid question"
    }, 400);
  }

  try {
    /*
     * Einfache erste Suchstrategie:
     * Wörter aus der Frage extrahieren.
     */
    const words = [
      ...new Set(
        question.toLowerCase()
          .match(/[\p{L}\p{N}]{4,}/gu) || []
      )
    ].filter(word =>
      ![
        "welche",
        "haben",
        "bereits",
        "wissen",
        "über",
        "unser",
        "unsere",
        "kannst",
        "bitte",
        "wurde",
        "wurden",
        "mich",
        "erkläre",
        "zusammen"
      ].includes(word)
    ).slice(0, 6);

    if (words.length === 0) {
      return reply({
        success: true,
        knowledgeFound: false,
        answer:
          "Bitte formuliere deine Frage " +
          "mit einem konkreten Thema.",
        sources: []
      });
    }

    /*
     * Sichere Stichwortsuche in D1.
     * Maximal 15 Einträge.
     */
    const patterns = words.map(word =>
      "%" +
      word
        .replace(/\\/g, "\\\\")
        .replace(/%/g, "\\%")
        .replace(/_/g, "\\_") +
      "%"
    );

    const clauses = words.map(
      () => `(
        title LIKE ? ESCAPE '\\'
        OR summary LIKE ? ESCAPE '\\'
        OR content LIKE ? ESCAPE '\\'
        OR tags LIKE ? ESCAPE '\\'
      )`
    );

    const params = patterns.flatMap(
      pattern => [
        pattern,
        pattern,
        pattern,
        pattern
      ]
    );

    const { results } = await env.DB.prepare(
      `SELECT
         id,
         title,
         summary,
         verification_status
       FROM brain_entries
       WHERE ${clauses.join(" OR ")}
       ORDER BY created_at DESC
       LIMIT 15`
    ).bind(...params).all();

    const entries = results || [];

    if (entries.length === 0) {
      return reply({
        success: true,
        knowledgeFound: false,
        answer:
          "Dazu habe ich bisher keine passenden " +
          "Informationen in meinem Second Brain.",
        sources: []
      });
    }

    /*
     * Gefundenes Wissen an das geschützte
     * Workers-AI-Backend übergeben.
     */
    const response = await fetch(
      BACKEND + "/api/brain-answer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${env.JARVIS_BACKEND_API_KEY}`
        },
        body: JSON.stringify({
          question: question.trim(),
          entries
        }),
        signal: AbortSignal.timeout(20000)
      }
    );

    if (!response.ok) {
      throw new Error("Answer engine unavailable");
    }

    const result = await response.json();

    if (
      result.success !== true ||
      typeof result.answer !== "string"
    ) {
      throw new Error("Invalid answer result");
    }

    return reply({
      ...result,
      matchedEntries: entries.length
    });

  } catch (error) {
    console.error(
      "JARVIS Second Brain question failed",
      error?.name || "Error"
    );

    return reply({
      success: false,
      error: "Second Brain question failed"
    }, 502);
  }
}
