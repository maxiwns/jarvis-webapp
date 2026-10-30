
/*
 * JARVIS Second Brain – Speicherung 1.0
 *
 * KI kategorisiert den Inhalt.
 * D1 verwaltet Kategorien und Wissenseinträge.
 *
 * Voraussetzung:
 * Authentifizierung über functions/_middleware.js
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

async function findOrCreateCategory(
  db,
  name,
  parentId = null
) {
  const categoryName = name.trim();

  if (!categoryName || categoryName.length > 80) {
    throw new Error("Invalid category");
  }

  // Vorhandene Kategorie wiederverwenden.
  const lookup = parentId === null
    ? db.prepare(
        `SELECT id FROM brain_categories
         WHERE parent_id IS NULL
         AND name = ? COLLATE NOCASE
         LIMIT 1`
      ).bind(categoryName)
    : db.prepare(
        `SELECT id FROM brain_categories
         WHERE parent_id = ?
         AND name = ? COLLATE NOCASE
         LIMIT 1`
      ).bind(parentId, categoryName);

  const existing = await lookup.first();

  if (existing) {
    return existing.id;
  }

  const id = crypto.randomUUID();

  // OR IGNORE verhindert doppelte Kategorien,
  // wenn zwei Anfragen gleichzeitig eintreffen.
  await db.prepare(
    `INSERT OR IGNORE INTO brain_categories
     (id, name, parent_id)
     VALUES (?, ?, ?)`
  ).bind(
    id,
    categoryName,
    parentId
  ).run();

  const saved = parentId === null
    ? await db.prepare(
        `SELECT id FROM brain_categories
         WHERE parent_id IS NULL
         AND name = ? COLLATE NOCASE
         LIMIT 1`
      ).bind(categoryName).first()
    : await db.prepare(
        `SELECT id FROM brain_categories
         WHERE parent_id = ?
         AND name = ? COLLATE NOCASE
         LIMIT 1`
      ).bind(parentId, categoryName).first();

  if (!saved) {
    throw new Error("Category could not be saved");
  }

  return saved.id;
}

/*
 * Lädt bestehende Kategorien aus D1
 * einschließlich ihrer übergeordneten Kategorie.
 */
async function loadExistingCategories(db) {
  const { results } = await db.prepare(
    `SELECT
       child.name AS category,
       parent.name AS parent
     FROM brain_categories AS child
     LEFT JOIN brain_categories AS parent
       ON child.parent_id = parent.id
     ORDER BY child.name
     LIMIT 100`
  ).all();

  return (results || []).map(item =>
    item.parent
      ? `${item.parent} / ${item.category}`
      : item.category
  );
}
  
/*
 * Lädt vorhandene Wissenseinträge für
 * den späteren semantischen Vergleich.
 *
 * Noch keine KI-Entscheidung und
 * keine automatische Zusammenführung.
 */
async function loadRelatedKnowledge(
  db,
  categoryId
) {
  if (typeof categoryId !== "string") {
    return [];
  }

  const { results } = await db.prepare(
    `SELECT
       id,
       title,
       summary,
       tags
     FROM brain_entries
     WHERE category_id = ?
     ORDER BY created_at DESC
     LIMIT 30`
  ).bind(categoryId).all();

  return (results || []).map(item => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    tags: (() => {
      try {
        const parsed = JSON.parse(item.tags);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })()
  }));
}

export async function onRequestPost(context) {
  const { request, env } = context;

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
      error: "Second Brain not configured"
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

  const declaredLength = Number(
    request.headers.get("Content-Length") || 0
  );

  if (declaredLength > 20000) {
    return reply({
      success: false,
      error: "Request too large"
    }, 413);
  }

  let body;

  try {
    const raw = await request.text();

    if (raw.length > 18000) {
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

  const content = body?.content;
  const title = body?.title || "";

  if (
    typeof content !== "string" ||
    !content.trim() ||
    content.length > 12000 ||
    typeof title !== "string" ||
    title.length > 200
  ) {
    return reply({
      success: false,
      error: "Invalid knowledge input"
    }, 400);
  }

  try {
    // Erst nach einem identischen Inhalt suchen.
    // Wiederholte Tests erzeugen keine neuen Einträge.
    const duplicate = await env.DB.prepare(
      `SELECT id, title, category_id
       FROM brain_entries
       WHERE content = ?
         AND source_job_id IS NULL
       LIMIT 1`
    ).bind(content.trim()).first();

    if (duplicate) {
      return reply({
        success: true,
        saved: true,
        duplicate: true,
        entryId: duplicate.id,
        title: duplicate.title,
        categoryId: duplicate.category_id
      });
    }
    const existingCategories =
      await loadExistingCategories(env.DB);
    // KI-Kategorisierung über geschütztes Backend.
    const aiResponse = await fetch(
      BACKEND + "/api/brain-categorize",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${env.JARVIS_BACKEND_API_KEY}`
        },
        
body: JSON.stringify({
  title,
  content: content.trim(),
  existingCategories
}),

        signal: AbortSignal.timeout(20000)
      }
    );

    if (!aiResponse.ok) {
      throw new Error("Categorization unavailable");
    }

    const ai = await aiResponse.json();

    if (
      ai.success !== true ||
      typeof ai.title !== "string" ||
      !ai.title.trim() ||
      typeof ai.category !== "string" ||
      !ai.category.trim() ||
      typeof ai.summary !== "string" ||
      !ai.summary.trim()
    ) {
      throw new Error("Invalid categorization result");
    }

    // Kategorie und Unterkategorie automatisch
    // erstellen oder wiederverwenden.
    const parentId = await findOrCreateCategory(
      env.DB,
      ai.category
    );

    const subcategory =
      typeof ai.subcategory === "string"
        ? ai.subcategory.trim()
        : "";

    const categoryId = subcategory
      ? await findOrCreateCategory(
          env.DB,
          subcategory,
          parentId
        )
      : parentId;
    
/*
 * Vorhandenes Wissen derselben Kategorie laden.
 * Noch keine automatische Zusammenführung.
 */
const relatedKnowledge =
  await loadRelatedKnowledge(env.DB, categoryId);
    
/*
 * JARVIS – Semantischer Wissensvergleich
 *
 * Vergleicht neue Erkenntnisse mit vorhandenen
 * Einträgen derselben Kategorie.
 * Löscht oder verändert keine bestehenden Einträge.
 */

let semanticComparison = {
  success: false,
  compared: 0,
  matches: [],
  status: "not_checked"
};

if (relatedKnowledge.length > 0) {
  try {
    const compareResponse = await fetch(
      BACKEND + "/api/brain-compare",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `Bearer ${env.JARVIS_BACKEND_API_KEY}`
        },
        body: JSON.stringify({
          title: ai.title,
          summary: ai.summary,
          candidates: relatedKnowledge
        }),
        signal: AbortSignal.timeout(20000)
      }
    );

    if (!compareResponse.ok) {
      throw new Error("Comparison request failed");
    }

    const comparison = await compareResponse.json();

    if (
      comparison.success !== true ||
      !Array.isArray(comparison.matches)
    ) {
      throw new Error("Invalid comparison result");
    }

    semanticComparison = {
      success: true,
      compared: comparison.compared,
      matches: comparison.matches,
      status: "completed"
    };

  } catch (error) {
    console.error(
      "JARVIS semantic comparison failed",
      error?.name || "Error"
    );

    semanticComparison.status = "failed";
  }
} else {
  semanticComparison = {
    success: true,
    compared: 0,
    matches: [],
    status: "no_candidates"
  };
}



    const tags = Array.isArray(ai.tags)
      ? ai.tags
          .filter(tag => typeof tag === "string")
          .map(tag => tag.trim().slice(0, 40))
          .filter(Boolean)
          .slice(0, 5)
      : [];

    const id = crypto.randomUUID();

    // Eintrag mit sicher gebundenen SQL-Parametern
    // im Second Brain speichern.
    await env.DB.prepare(
      `INSERT INTO brain_entries (
         id,
         title,
         content,
         summary,
         category_id,
         entry_type,
         source_type,
         source_urls,
         tags,
         verification_status
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      ai.title.trim().slice(0, 200),
      content.trim(),
      ai.summary.trim().slice(0, 1500),
      categoryId,
      "knowledge",
      "agent",
      "[]",
      JSON.stringify(tags),
      "unverified"
    ).run();

    return reply({
      success: true,
      saved: true,
      duplicate: false,
      entryId: id,
      title: ai.title,
      category: ai.category,
      subcategory,
      categoryId,
      summary: ai.summary,
      tags,
      

verificationStatus: "unverified",
relatedKnowledgeCount: relatedKnowledge.length,
semanticComparison


    });

  } catch (error) {
    console.error(
      "JARVIS brain save failed",
      error?.name || "Error"
    );

    return reply({
      success: false,
      saved: false,
      error: "Second Brain save failed"
    }, 502);
  }
}
