
/* JARVIS 0.9 – Second Brain Wissensbibliothek */

(() => {
  "use strict";

  const page = document.getElementById("brain");
  if (!page) return;

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.style.marginBottom = "14px";

  const inner = document.createElement("div");
  inner.className = "inner";

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:10px";

  const title = document.createElement("strong");
  title.textContent = "☁ Cloud Second Brain";

  const reload = document.createElement("button");
  reload.className = "btn";
  reload.type = "button";
  reload.textContent = "Aktualisieren";

  header.append(title, reload);

  const status = document.createElement("p");
  status.className = "note";
  status.textContent = "Wissensbibliothek wird geladen ...";

  const search = document.createElement("input");
  search.type = "search";
  search.className = "field";
  search.placeholder = "Wissen durchsuchen ...";
  search.setAttribute("aria-label", "Wissen durchsuchen");

  const layout = document.createElement("div");
  layout.className = "jarvis-brain-layout";

  const folders = document.createElement("div");
  folders.className = "jarvis-brain-folders";

  const results = document.createElement("div");
  results.className = "jarvis-brain-results";

  layout.append(folders, results);
  inner.append(header, status, search, layout);
  panel.append(inner);

  const stack = page.querySelector(".stack");

  if (stack) {
    page.insertBefore(panel, stack);
  } else {
    page.append(panel);
  }

  const style = document.createElement("style");
  style.textContent = `
    .jarvis-brain-layout {
      display:grid;
      grid-template-columns:minmax(160px,1fr) minmax(0,2fr);
      gap:14px;
      margin-top:14px;
    }
    .jarvis-brain-folders {
      display:grid;
      gap:7px;
      align-content:start;
    }
    .jarvis-brain-folder {
      width:100%;
      text-align:left;
      padding:10px;
      color:inherit;
      background:rgba(128,128,128,.10);
      border:1px solid rgba(128,128,128,.3);
      border-radius:9px;
      cursor:pointer;
      overflow-wrap:anywhere;
    }
    .jarvis-brain-folder.active {
      border-color:#8a9eff;
      background:rgba(138,158,255,.15);
    }
    .jarvis-brain-entry {
      margin-bottom:9px;
      padding:13px;
      border:1px solid rgba(128,128,128,.3);
      border-radius:10px;
      background:rgba(128,128,128,.07);
    }
    .jarvis-brain-entry summary {
      cursor:pointer;
      font-weight:600;
      overflow-wrap:anywhere;
    }
    .jarvis-brain-entry p {
      white-space:pre-wrap;
      overflow-wrap:anywhere;
    }
    @media(max-width:650px) {
      .jarvis-brain-layout {
        grid-template-columns:1fr;
      }
    }
  `;
  document.head.append(style);

  let categories = [];
  let entries = [];
  let selectedCategory = null;

  function descendants(id) {
    const ids = new Set([id]);
    let changed = true;

    while (changed) {
      changed = false;

      for (const category of categories) {
        if (
          ids.has(category.parent_id) &&
          !ids.has(category.id)
        ) {
          ids.add(category.id);
          changed = true;
        }
      }
    }

    return ids;
  }

  function folderButton(label, id, depth = 0) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "jarvis-brain-folder";

    if (selectedCategory === id) {
      button.classList.add("active");
    }

    button.style.paddingLeft = (10 + depth * 14) + "px";
    button.textContent = label;

    button.addEventListener("click", () => {
      selectedCategory = id;
      render();
    });

    folders.append(button);
  }

  function renderFolders() {
    folders.replaceChildren();

    folderButton(
      "Alle Wissenseinträge (" + entries.length + ")",
      null
    );

    const visited = new Set();

    function draw(parentId, depth) {
      for (const category of categories) {
        if (category.parent_id !== parentId) continue;
        if (visited.has(category.id)) continue;

        visited.add(category.id);

        const ids = descendants(category.id);
        const count = entries.filter(entry =>
          ids.has(entry.category_id)
        ).length;

        folderButton(
          (depth ? "↳ " : "▸ ") +
          category.name + " (" + count + ")",
          category.id,
          depth
        );

        draw(category.id, depth + 1);
      }
    }

    draw(null, 0);

    for (const category of categories) {
      if (!visited.has(category.id)) {
        folderButton(category.name, category.id);
      }
    }
  }

  function renderEntries() {
    results.replaceChildren();

    const term = search.value.trim().toLocaleLowerCase("de");
    const allowed = selectedCategory
      ? descendants(selectedCategory)
      : null;

    const matches = entries.filter(entry => {
      if (allowed && !allowed.has(entry.category_id)) {
        return false;
      }

      const text = (
        (entry.title || "") + " " +
        (entry.summary || "")
      ).toLocaleLowerCase("de");

      return !term || text.includes(term);
    });

    const count = document.createElement("p");
    count.className = "note";
    count.textContent = matches.length + " Einträge gefunden";
    results.append(count);

    if (matches.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "Keine passenden Einträge.";
      results.append(empty);
      return;
    }

    for (const entry of matches) {
      const card = document.createElement("details");
      card.className = "jarvis-brain-entry";

      const heading = document.createElement("summary");
      heading.textContent = entry.title || "Ohne Titel";

      const summary = document.createElement("p");
      summary.textContent =
        entry.summary || "Keine Zusammenfassung vorhanden.";

      const meta = document.createElement("small");
      meta.textContent =
        entry.verification_status === "verified"
          ? "Verifiziert"
          : "Nicht extern verifiziert";

      card.append(heading, summary, meta);
      results.append(card);
    }
  }

  function render() {
    renderFolders();
    renderEntries();
  }

  async function loadLibrary() {
    reload.disabled = true;
    status.textContent = "Lade Cloud-Wissen ...";

    try {
      const response = await fetch("/api/brain-library", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("API-Fehler " + response.status);
      }

      const data = await response.json();

      if (data.success !== true) {
        throw new Error("Ungültige API-Antwort");
      }

      categories = Array.isArray(data.categories)
        ? data.categories : [];

      entries = Array.isArray(data.entries)
        ? data.entries : [];

      status.textContent =
        entries.length + " Wissenseinträge geladen";

      render();

    } catch (error) {
      status.textContent =
        "Wissensbibliothek konnte nicht geladen werden: " +
        error.message;
    } finally {
      reload.disabled = false;
    }
  }

  search.addEventListener("input", renderEntries);
  reload.addEventListener("click", loadLibrary);

  loadLibrary();
})();
