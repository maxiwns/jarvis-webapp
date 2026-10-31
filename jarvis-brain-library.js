
/* JARVIS 0.9 – Second Brain Ordner-Explorer */

(() => {
  "use strict";

  const page = document.getElementById("brain");
  if (!page) return;

  document.getElementById("jarvis-brain-library")?.remove();

  const panel = document.createElement("section");
  panel.id = "jarvis-brain-library";
  panel.className = "panel";

  panel.innerHTML = `
    <div class="inner">
      <div class="jbl-header">
        <div>
          <strong>Second Brain</strong>
          <div id="jbl-status" class="jbl-muted">
            Wissen wird geladen ...
          </div>
        </div>
        <div class="jbl-actions">
          <button id="jbl-sidebar-toggle" type="button"
            class="btn">Ordner ausblenden</button>
          <button id="jbl-reload" type="button"
            class="btn">Aktualisieren</button>
        </div>
      </div>

      <input id="jbl-search" type="search" class="field"
        placeholder="Wissen durchsuchen ..."
        aria-label="Second Brain durchsuchen">

      <div id="jbl-layout" class="jbl-layout">
        <nav id="jbl-sidebar" class="jbl-sidebar"
          aria-label="Wissensordner"></nav>

        <main class="jbl-main">
          <div id="jbl-breadcrumb" class="jbl-breadcrumb"></div>
          <div id="jbl-items" class="jbl-items"></div>
        </main>
      </div>
    </div>
  `;

  const stack = page.querySelector(".stack");

  if (stack) page.insertBefore(panel, stack);
  else page.append(panel);

  const style = document.createElement("style");
  style.textContent = `
    #jarvis-brain-library {
      margin-bottom:16px;
      min-width:0;
    }

    #jarvis-brain-library * {
      box-sizing:border-box;
    }

    .jbl-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      gap:12px;
      margin-bottom:15px;
    }

    .jbl-actions {
      display:flex;
      gap:7px;
      flex-wrap:wrap;
    }

    .jbl-muted {
      color:inherit;
      opacity:.6;
      font-size:12px;
      margin-top:5px;
    }

    #jbl-search {
      display:block;
      width:100%;
      max-width:100%;
      margin-bottom:16px;
    }

    .jbl-layout {
      display:grid;
      grid-template-columns:minmax(0,225px) minmax(0,1fr);
      gap:14px;
      align-items:start;
    }

    .jbl-layout.sidebar-hidden {
      grid-template-columns:minmax(0,1fr);
    }

    .jbl-layout.sidebar-hidden .jbl-sidebar {
      display:none;
    }

    .jbl-sidebar {
      padding:9px;
      min-width:0;
      border:1px solid rgba(150,150,160,.23);
      background:rgba(140,140,150,.04);
      border-radius:12px;
    }

    .jbl-tree-row {
      display:flex;
      align-items:center;
      gap:3px;
      margin:3px 0;
      min-width:0;
    }

    .jbl-expand {
      width:26px;
      min-width:26px;
      height:31px;
      border:0;
      border-radius:6px;
      color:inherit;
      background:transparent;
      cursor:pointer;
    }

    .jbl-folder-button {
      flex:1;
      min-width:0;
      padding:8px 5px;
      border:0;
      border-radius:8px;
      background:transparent;
      color:inherit;
      font:inherit;
      font-size:13px;
      text-align:left;
      overflow-wrap:anywhere;
      cursor:pointer;
    }

    .jbl-folder-button.active {
      background:rgba(130,150,255,.2);
      font-weight:600;
    }

    .jbl-tree-children {
      margin-left:13px;
      padding-left:7px;
      border-left:1px solid rgba(150,150,160,.25);
    }

    .jbl-main {
      min-width:0;
    }

    .jbl-breadcrumb {
      display:flex;
      align-items:center;
      gap:6px;
      flex-wrap:wrap;
      margin-bottom:14px;
    }

    .jbl-crumb {
      border:0;
      background:transparent;
      padding:5px;
      color:inherit;
      opacity:.75;
      cursor:pointer;
      font:inherit;
      font-size:12px;
    }

    .jbl-crumb:last-child {
      font-weight:700;
      opacity:1;
    }

    .jbl-items {
      display:grid;
      gap:9px;
    }

    .jbl-item-folder {
      width:100%;
      padding:15px;
      text-align:left;
      font:inherit;
      color:inherit;
      background:rgba(140,140,150,.075);
      border:1px solid rgba(150,150,160,.25);
      border-radius:11px;
      cursor:pointer;
      overflow-wrap:anywhere;
    }

    .jbl-item-folder:hover {
      background:rgba(140,140,150,.14);
    }

    .jbl-entry {
      min-width:0;
      border:1px solid rgba(150,150,160,.25);
      border-radius:11px;
      background:rgba(140,140,150,.06);
      overflow:hidden;
    }

    .jbl-entry summary {
      padding:15px;
      cursor:pointer;
      font-size:13px;
      font-weight:600;
      line-height:1.5;
      overflow-wrap:anywhere;
    }

    .jbl-entry[open] summary {
      border-bottom:1px solid rgba(150,150,160,.2);
    }

    .jbl-entry-body {
      padding:15px;
      font-size:13px;
      line-height:1.7;
      white-space:pre-wrap;
      overflow-wrap:anywhere;
    }

    .jbl-meta {
      margin-top:12px;
      opacity:.65;
      font-size:11px;
    }

    @media(max-width:700px) {
      .jbl-layout {
        grid-template-columns:minmax(0,1fr);
      }
    }
  `;
  document.head.append(style);

  const sidebar = panel.querySelector("#jbl-sidebar");
  const layout = panel.querySelector("#jbl-layout");
  const items = panel.querySelector("#jbl-items");
  const breadcrumb = panel.querySelector("#jbl-breadcrumb");
  const status = panel.querySelector("#jbl-status");
  const search = panel.querySelector("#jbl-search");
  const reload = panel.querySelector("#jbl-reload");
  const sidebarToggle =
    panel.querySelector("#jbl-sidebar-toggle");

  let categories = [];
  let entries = [];
  let currentFolder = null;
  let sidebarVisible = true;

  // Nur für die seitliche Baumansicht.
  const expanded = new Set();

  function folderById(id) {
    return categories.find(c => c.id === id) || null;
  }

  function childFolders(parentId) {
    return categories.filter(c =>
      (c.parent_id || null) === parentId
    );
  }

  function folderEntries(folderId) {
    return entries.filter(entry =>
      entry.category_id === folderId
    );
  }

  function descendantCount(folderId) {
    const visited = new Set();
    const queue = [folderId];

    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);

      for (const child of childFolders(id)) {
        queue.push(child.id);
      }
    }

    return entries.filter(entry =>
      visited.has(entry.category_id)
    ).length;
  }

  function openFolder(id) {
    currentFolder = id;
    search.value = "";

    // In der Seitenleiste den Weg zum Ordner öffnen.
    let cursor = folderById(id);
    const seen = new Set();

    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      if (cursor.parent_id) expanded.add(cursor.parent_id);
      cursor = folderById(cursor.parent_id);
    }

    render();
  }

  function createButton(label, className, action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = label;
    button.addEventListener("click", action);
    return button;
  }

  function renderSidebar() {
    sidebar.replaceChildren();

    const all = createButton(
      "▣ Alle Beiträge",
      "jbl-folder-button" +
        (currentFolder === null ? " active" : ""),
      () => openFolder(null)
    );

    sidebar.append(all);

    const visited = new Set();

    function draw(parentId, container) {
      for (const folder of childFolders(parentId)) {
        if (visited.has(folder.id)) continue;
        visited.add(folder.id);

        const children = childFolders(folder.id);
        const row = document.createElement("div");
        row.className = "jbl-tree-row";

        const expand = createButton(
          children.length
            ? (expanded.has(folder.id) ? "▾" : "▸")
            : "·",
          "jbl-expand",
          () => {
            if (expanded.has(folder.id)) {
              expanded.delete(folder.id);
            } else {
              expanded.add(folder.id);
            }
            renderSidebar();
          }
        );

        expand.disabled = children.length === 0;
        expand.setAttribute(
          "aria-label",
          "Unterordner " +
            (expanded.has(folder.id) ? "einklappen" : "aufklappen")
        );
        expand.setAttribute(
          "aria-expanded",
          String(expanded.has(folder.id))
        );

        const button = createButton(
          "📁 " + folder.name +
          " (" + descendantCount(folder.id) + ")",
          "jbl-folder-button" +
            (currentFolder === folder.id ? " active" : ""),
          () => openFolder(folder.id)
        );

        row.append(expand, button);
        container.append(row);

        if (expanded.has(folder.id) && children.length) {
          const childContainer = document.createElement("div");
          childContainer.className = "jbl-tree-children";

          draw(folder.id, childContainer);
          container.append(childContainer);
        }
      }
    }

    
    draw(null, sidebar);
  }

  function renderBreadcrumb() {

    breadcrumb.replaceChildren();

    breadcrumb.append(
      createButton(
        "Alle Beiträge",
        "jbl-crumb",
        () => openFolder(null)
      )
    );

    const path = [];
    let folder = folderById(currentFolder);
    const seen = new Set();

    while (folder && !seen.has(folder.id)) {
      seen.add(folder.id);
      path.unshift(folder);
      folder = folderById(folder.parent_id);
    }

    for (const part of path) {
      const separator = document.createElement("span");
      separator.textContent = "›";

      breadcrumb.append(separator);
      breadcrumb.append(
        createButton(
          part.name,
          "jbl-crumb",
          () => openFolder(part.id)
        )
      );
    }
  }

  function renderEntry(entry) {
    const card = document.createElement("details");
    card.className = "jbl-entry";

    const title = document.createElement("summary");
    title.textContent = entry.title || "Ohne Titel";

    const body = document.createElement("div");
    body.className = "jbl-entry-body";

    const summary = document.createElement("div");
    summary.textContent =
      entry.summary || "Keine Zusammenfassung vorhanden.";

    const meta = document.createElement("div");
    meta.className = "jbl-meta";

    meta.textContent =
      entry.verification_status === "verified"
        ? "Verifiziert"
        : "Noch nicht extern verifiziert";

    body.append(summary, meta);
    card.append(title, body);
    items.append(card);
  }

  function renderMain() {
    items.replaceChildren();
    renderBreadcrumb();

    const term = search.value.trim().toLocaleLowerCase("de");

    // Nur eine ausdrückliche Suche zeigt Treffer
    // aus verschiedenen Ordnern gleichzeitig.
    if (term) {
      const matches = entries.filter(entry =>
        ((entry.title || "") + " " + (entry.summary || ""))
          .toLocaleLowerCase("de")
          .includes(term)
      );

      for (const entry of matches) {
        renderEntry(entry);
      }

      if (!matches.length) {
        const empty = document.createElement("p");
        empty.textContent = "Keine Treffer gefunden.";
        items.append(empty);
      }

      return;
    }

    // Wichtig: Alle Beiträge zeigt nur Hauptordner.
    // Beiträge werden niemals ungefragt gesammelt angezeigt.
    const folders = childFolders(currentFolder);

    for (const folder of folders) {
      items.append(createButton(
        "📁 " + folder.name +
        "  (" + descendantCount(folder.id) + ")",
        "jbl-item-folder",
        () => openFolder(folder.id)
      ));
    }

    // Einträge erst im tatsächlich geöffneten Ordner.
    if (currentFolder !== null) {
      for (const entry of folderEntries(currentFolder)) {
        renderEntry(entry);
      }
    }

    if (!items.childNodes.length) {
      const empty = document.createElement("p");
      empty.className = "jbl-muted";
      empty.textContent =
        currentFolder === null
          ? "Noch keine Wissenskategorien vorhanden."
          : "Dieser Ordner ist leer.";
      items.append(empty);
    }
  }

  function render() {
    renderSidebar();
    renderMain();
  }

  async function loadLibrary() {
    reload.disabled = true;
    status.textContent = "Wissen wird geladen ...";

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

      if (currentFolder && !folderById(currentFolder)) {
        currentFolder = null;
      }

      status.textContent =
        entries.length + " Wissenseinträge geladen";

      render();

    } catch (error) {
      status.textContent =
        "Laden fehlgeschlagen: " + error.message;
    } finally {
      reload.disabled = false;
    }
  }

  sidebarToggle.addEventListener("click", () => {
    sidebarVisible = !sidebarVisible;

    layout.classList.toggle(
      "sidebar-hidden",
      !sidebarVisible
    );

    sidebarToggle.textContent = sidebarVisible
      ? "Ordner ausblenden"
      : "Ordner anzeigen";
  });

  search.addEventListener("input", renderMain);
  reload.addEventListener("click", loadLibrary);

  loadLibrary();
})();
