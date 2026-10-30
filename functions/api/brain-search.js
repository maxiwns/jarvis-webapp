
/*
 * JARVIS – Second Brain Suche 1.0
 *
 * Sucht gespeichertes Wissen in D1.
 * Nur lesender Zugriff.
 *
 * Authentifizierung erfolgt über
 * functions/_middleware.js.
 */

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

  if (!env.DB) {
    return reply({
      success: false,
      error: "Database unavailable"
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

  const query = body?.query;

  if (
    typeof query !== "string" ||
    query.trim().length < 2 ||
    query.length > 200
  ) {
    return reply({
      success: false,
      error: "Invalid search query"
    }, 400);
  }

  try {
    // LIKE-Sonderzeichen maskieren,
    // damit sie als Suchtext behandelt werden.
    const escaped = query.trim()
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");

    const pattern = `%${escaped}%`;

    const { results } = await env.DB.prepare(
      `SELECT
         e.id,
         e.title,
         e.summary,
         e.tags,
         e.verification_status,
         e.created_at,
         c.name AS category,
         p.name AS parent_category
       FROM brain_entries e
       LEFT JOIN brain_categories c
         ON e.category_id = c.id
       LEFT JOIN brain_categories p
         ON c.parent_id = p.id
       WHERE e.title LIKE ? ESCAPE '\\'
          OR e.summary LIKE ? ESCAPE '\\'
          OR e.content LIKE ? ESCAPE '\\'
          OR e.tags LIKE ? ESCAPE '\\'
       ORDER BY e.created_at DESC
       LIMIT 20`
    ).bind(
      pattern,
      pattern,
      pattern,
      pattern
    ).all();

    return reply({
      success: true,
      query: query.trim(),
      count: results.length,
      results: results.map(item => ({
        ...item,
        tags: (() => {
          try {
            return JSON.parse(item.tags);
          } catch {
            return [];
          }
        })()
      }))
    });

  } catch (error) {
    console.error(
      "Second Brain search failed",
      error?.name || "Error"
    );

    return reply({
      success: false,
      error: "Knowledge search failed"
    }, 502);
  }
}
