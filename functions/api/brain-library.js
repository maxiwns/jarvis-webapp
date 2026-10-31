
/*
 * JARVIS 0.9 – Second Brain Library
 * Liest Kategorien und Wissenseinträge für die Oberfläche.
 * Schreibgeschützte API.
 */

function respond(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet({ env }) {
  if (!env.DB) {
    return respond({
      success: false,
      error: "Database unavailable"
    }, 503);
  }

  try {
    const categoriesResult = await env.DB.prepare(`
      SELECT
        id,
        name,
        parent_id,
        description
      FROM brain_categories
      ORDER BY name COLLATE NOCASE
    `).all();

    const entriesResult = await env.DB.prepare(`
      SELECT
        id,
        title,
        summary,
        category_id,
        entry_type,
        verification_status,
        created_at,
        updated_at
      FROM brain_entries
      ORDER BY created_at DESC
      LIMIT 200
    `).all();

    const categories = categoriesResult.results || [];
    const entries = entriesResult.results || [];

    const counts = {};

    for (const entry of entries) {
      const key = entry.category_id || "uncategorized";
      counts[key] = (counts[key] || 0) + 1;
    }

    const structuredCategories = categories.map(category => ({
      ...category,
      entryCount: counts[category.id] || 0,
      children: categories
        .filter(child => child.parent_id === category.id)
        .map(child => ({
          id: child.id,
          name: child.name,
          entryCount: counts[child.id] || 0
        }))
    }));

    return respond({
      success: true,
      totalLoaded: entries.length,
      categories: structuredCategories,
      entries
    });

  } catch (error) {
    console.error(
      "JARVIS brain library failed",
      error?.name || "Error"
    );

    return respond({
      success: false,
      error: "Could not load Second Brain"
    }, 500);
  }
}
