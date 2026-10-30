
/*
 * JARVIS – Second Brain API Proxy
 *
 * Verbindet die geschützte Pages-App
 * mit der KI-Kategorisierung im Backend.
 *
 * Schreibt noch keine Daten in D1.
 */

export async function onRequestPost(context) {
  const { request, env } = context;

  const origin = request.headers.get("Origin");
  const currentOrigin =
    new URL(request.url).origin;

  if (origin && origin !== currentOrigin) {
    return Response.json(
      {
        success: false,
        error: "Origin not permitted"
      },
      { status: 403 }
    );
  }

  if (!env.JARVIS_BACKEND_API_KEY) {
    return Response.json(
      {
        success: false,
        error: "Backend not configured"
      },
      { status: 503 }
    );
  }

  const contentType =
    request.headers.get("Content-Type") || "";

  if (
    !contentType.toLowerCase()
      .startsWith("application/json")
  ) {
    return Response.json(
      {
        success: false,
        error: "JSON required"
      },
      { status: 415 }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        success: false,
        error: "Invalid JSON"
      },
      { status: 400 }
    );
  }

  if (
    typeof body?.content !== "string" ||
    !body.content.trim() ||
    body.content.length > 16000 ||
    (
      body.title !== undefined &&
      (
        typeof body.title !== "string" ||
        body.title.length > 200
      )
    )
  ) {
    return Response.json(
      {
        success: false,
        error: "Invalid knowledge input"
      },
      { status: 400 }
    );
  }
     
if (!env.DB) {
  return Response.json(
    {
      success: false,
      error: "Second Brain database unavailable"
    },
    { status: 503 }
  );
}

let existingCategories;

try {
  const { results } = await env.DB.prepare(
    `SELECT
       child.name AS category,
       parent.name AS parent
     FROM brain_categories AS child
     LEFT JOIN brain_categories AS parent
       ON child.parent_id = parent.id
     ORDER BY child.name
     LIMIT 100`
  ).all();

  existingCategories = (results || []).map(
    item => item.parent
      ? `${item.parent} / ${item.category}`
      : item.category
  );

} catch (error) {
  console.error("Could not load brain categories");

  return Response.json(
    {
      success: false,
      error: "Category lookup failed"
    },
    { status: 502 }
  );
}

  try {
    const backendResponse = await fetch(
      "https://jarvis-backend.maxiwiens.workers.dev/api/brain-categorize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${env.JARVIS_BACKEND_API_KEY}`
        },
        
body: JSON.stringify({
  title: body.title || "",
  content: body.content.trim(),
  existingCategories
}),

        signal: AbortSignal.timeout(20000)
      }
    );

    const result = await backendResponse.json();

    return Response.json(result, {
      status: backendResponse.status,
      headers: {
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    console.error(
      "Second Brain proxy failed",
      error?.name || "Unknown error"
    );

    return Response.json(
      {
        success: false,
        error: "Second Brain unavailable"
      },
      { status: 502 }
    );
  }
}
