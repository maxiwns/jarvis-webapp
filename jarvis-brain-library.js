
/* JARVIS 0.9 – Aufklappbare Second-Brain-Bibliothek */
(() => {
  "use strict";

  const page = document.getElementById("brain");
  if (!page) return;

  const old = page.querySelector("#jarvis-brain-library");
  if (old) old.remove();

  const panel = document.createElement("section");
  panel.id = "jarvis-brain-library";
  panel.className = "panel";

  panel.innerHTML = `
    <div class="inner">
      <div class="jb-header">
        <div>
          <strong>Second Brain</strong>
          <div class="jb-muted" id="jb-status">
            Wissensbibliothek wird geladen ...
          </div>
        </div>
        <button type="button" class="btn" id="jb-reload">
          Aktualisieren
        </button>
      </div>

      <input
        id="jb-search"
        class="field"
        type="search"
        placeholder="Wissen durchsuchen ..."
        aria-label="Wissenseinträge durchsuchen"
      >

      <div class="jb-layout">
        <nav id="jb-tree" class="jb-tree"
             aria-label="Wissenskategorien"></nav>
        <div id="jb-content" class="jb-content"></div>
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

    .jb-header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      flex-wrap:wrap;
      gap:12px;
      margin-bottom:14px;
    }

    .jb-muted {
      font-size:12px;
      opacity:.65;
      margin-top:5px;
    }

    #jb-search {
      display:block;
      width:100%;
      max-width:100%;
      margin-bottom:16px;
    }

    .jb-layout {
      display:grid;
      grid-template-columns:minmax(0,220px) minmax(0,1fr);
      gap:14px;
      align-items:start;
      width:100%;
      min-width:0;
    }

    .jb-tree {
      min-width:0;
      padding:10px;
      border:1px solid rgba(140,140,150,.22);
      border-radius:12px;
      background:rgba(140,140,150,.045);
    }

    .jb-tree-row {
      display:flex;
      align-items:center;
      gap:4px;
      min-width:0;
      margin:2px 0;
    }

    .jb-toggle {
      flex:0 0 26px;
      width:26px;
      height:32px;
      border:0;
      background:transparent;
      color:inherit;
      cursor:pointer;
      border-radius:6px;
    }

    .jb-folder {
      display:block;
      flex:1;
      min-width:0;
      padding:8px 6px;
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

    .jb-folder:hover,
    .jb-toggle:hover {
      background:rgba(140,140,150,.12);
    }

    .jb-folder.active {
      background:rgba(120,145,255,.18);
      font-weight:600;
    }

    .jb-count {
      opacity:.55;
      font-size:11px;
    }

    .jb-children {
      margin-left:13px;
      padding-left:9px;
      border-left:1px solid rgba(140,140,150,.25);
    }

    .jb-content {
      min-width:0;
      display:grid;
      align-content:start;
      gap:9px;
    }

    .jb-section-title {
      font-weight:600;
      font-size:14px;
      margin:3px 0 6px;
    }

    .jb-entry {
      min-width:0;
      border:1px solid rgba(140,140,150,.22);
      border-radius:10px;
      background:rgba(140,140,150,.055);
      overflow:hidden;
    }

    .jb-entry summary {
      padding:13px;
      font-size:13px;
      font-weight:600;
      cursor:pointer;
      overflow-wrap:anywhere;
      line-height:1.5;
    }

    .jb-entry[open] summary {
      border-bottom:1px solid rgba(140,140,150,.18);
    }

    .jb-entry-body {
      padding:12px 13px;
      font-size:13px;
      line-height:1.6;
      overflow-wrap:anywhere;
      white-space:pre-wrap;
    }

    .jb-entry-meta {
      margin-top:10px;
      font-size:11px;
      opacity:.6;
    }

    @media (max-width:700px) {
      .jb-layout {
        grid-template-columns:minmax(0,1fr);
      }
      .jb-tree {
        padding:8px;
      }
      .jb-children {
        margin-left:9px;
      }
    }
  `;
  document.head.append(style);

  const tree = panel.querySelector("#jb-tree");
  const content = panel.querySelector("#jb-content");
  const status = panel.querySelector("#jb-status");
  const search = panel.querySelector("#jb-search");
  const reload = panel.querySelector("#jb-reload");

  let categories = [];
  let entries = [];
  let selected = null;

  const expanded = new Set();

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

  function makeFolder(label, id, count, depth = 0) {
    const row = document.createElement("div");
    row.className = "jb-tree-row";

    const children = categories.filter(
      category => category.parent_id === id
    );

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "jb-toggle";

    if (id && children.length) {
      toggle.textContent = expanded.has(id) ? "▾" : "▸";
      toggle.setAttribute(
        "aria-label",
        expanded.has(id) ? "Ordner einklappen" : "Ordner aufklappen"
      );
      toggle.setAttribute("aria-expanded", String(expanded.has(id)));

      toggle.onclick = () => {
        if (expanded.has(id)) expanded.delete(id);
        else expanded.add(id);
        renderTree();
      };
    } else {
      toggle.textContent = id ? "·" : "▣";
      toggle.disabled = true;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "jb-folder";
    if (selected === id) button.classList.add("active");

    const labelNode = document.createElement("span");
    labelNode.textContent = label + " ";

    const countNode = document.createElement("span");
    countNode.className = "jb-count";
    countNode.textContent = "(" + count + ")";

    button.append(labelNode, countNode);

    button.onclick = () => {
      selected = id;

      if (id && children.length) expanded.add(id);

      render();
    };

    row.append(toggle, button);
    return row;
  }

  function renderTree() {
    tree.replaceChildren();
    tree.append(makeFolder("Alle Einträge", null, entries.length));

    const visited = new Set();

    function draw(parentId, container) {
      for (const category of categories) {
        if (category.parent_id !== parentId) continue;
        if (visited.has(category.id)) continue;

        visited.add(category.id);

        const ids = descendants(category.id);
        const count = entries.filter(entry =>
          ids.has(entry.category_id)
        ).length;

        container.append(
          makeFolder(category.name, category.id, count)
        );

        if (expanded.has(category.id)) {
          const childContainer = document.createElement("div");
          childContainer.className = "jb-children";

          draw(category.id, childContainer);

          if (childContainer.childNodes.length) {
            container.append(childContainer);
          }
        }
      }
    }

    draw(null, tree);

    // Kategorien mit fehlender Elternkategorie auffangen.
    for (const category of categories) {
      if (!visited.has(category.id) &&
          !categories.some(c => c.id === category.parent_id)) {
        tree.append(
          makeFolder(category.name, category.id,
            entries.filter(e => e.category_id === category.id).length)
        );
      }
    }
  }

  function renderContent() {
    content.replaceChildren();

    const allowed = selected ? descendants(selected) : null;
    const term = search.value.trim().toLocaleLowerCase("de");

    const matches = entries.filter(entry => {
      if (allowed && !allowed.has(entry.category_id)) {
        return false;
      }

      const haystack = (
        (entry.title || "") + " " +
        (entry.summary || "")
      ).toLocaleLowerCase("de");

      return !term || haystack.includes(term);
    });

    const heading = document.createElement("div");
    heading.className = "jb-section-title";

    const selectedName = categories.find(
      category => category.id === selected
    )?.name || "Alle Wissenseinträge";

    heading.textContent =
      selectedName + " · " + matches.length + " Einträge";

    content.append(heading);

    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "jb-muted";
      empty.textContent = "Keine passenden Einträge gefunden.";
      content.append(empty);
      return;
    }

    for (const entry of matches) {
      const card = document.createElement("details");
      card.className = "jb-entry";

      const title = document.createElement("summary");
      title.textContent = entry.title || "Ohne Titel";

      const body = document.createElement("div");
      body.className = "jb-entry-body";

      const summary = document.createElement("div");
      summary.textContent =
        entry.summary || "Keine Zusammenfassung vorhanden.";

      const meta = document.createElement("div");
      meta.className = "jb-entry-meta";
      meta.textContent =
        entry.verification_status === "verified"
          ? "Verifiziert"
          : "Nicht extern verifiziert";

      body.append(summary, meta);
      card.append(title, body);
      content.append(card);
    }
  }

  function render() {
    renderTree();
    renderContent();
  }

  async function load() {
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
        throw new Error("Ungültige Antwort");
      }

      categories = Array.isArray(data.categories)
        ? data.categories : [];

      entries = Array.isArray(data.entries)
        ? data.entries : [];

      // Beim ersten Laden die Hauptkategorien öffnen.
      if (expanded.size === 0) {
        for (const category of categories) {
          if (category.parent_id === null) {
            expanded.add(category.id);
          }
        }
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

  search.addEventListener("input", renderContent);
  reload.addEventListener("click", load);

  load();
})();
