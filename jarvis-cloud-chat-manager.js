
/* JARVIS 0.9 – Cloud Chat mit Aufgabenverwaltung */

(() => {
  "use strict";

  const page = document.getElementById("chat");
  if (!page || document.getElementById("jarvis-cloud-manager")) return;

  const node = (tag, cls, value) => {
    const element = document.createElement(tag);
    if (cls) element.className = cls;
    if (value !== undefined) element.textContent = value;
    return element;
  };

  const style = node("style");

  style.textContent = `
    #chat > .hero { display:none !important; }

    #jarvis-cloud-manager {
      display:grid;
      grid-template-columns:230px 14px minmax(0,1fr);
      gap:0;
      min-height:0;
      overflow:hidden;
    }

    #jarvis-cloud-manager .jcm-panel {
      background:#1c1d20;
      border:1px solid #3a3b40;
      border-radius:14px;
      padding:14px;
      min-width:0;
      min-height:0;
    }

    #jarvis-cloud-manager .jcm-panel:first-child {
      display:flex;
      flex-direction:column;
      overflow:hidden;
    }

    #jarvis-cloud-manager .jcm-list {
      display:grid;
      align-content:start;
      gap:6px;
      flex:1;
      min-height:0;
      overflow-y:auto;
      margin-top:12px;
      overscroll-behavior:contain;
      -webkit-overflow-scrolling:touch;
    }

    #jarvis-cloud-manager .jcm-chat {
      background:#292a2e;
      color:#ededee;
      border:1px solid #424348;
      border-radius:9px;
      padding:10px;
      text-align:left;
      overflow-wrap:anywhere;
    }

    #jarvis-cloud-manager .jcm-chat.active {
      background:#38393d;
      border-color:#99999e;
    }

    #jarvis-cloud-manager .jcm-main {
      display:flex;
      flex-direction:column;
      gap:12px;
      min-width:0;
      min-height:0;
      overflow:hidden;
    }

    #jarvis-cloud-manager .jcm-messages {
      display:flex;
      flex-direction:column;
      gap:12px;
      flex:1;
      min-height:0;
      overflow-y:auto;
      padding:8px 0;
      overscroll-behavior:contain;
      -webkit-overflow-scrolling:touch;
    }

    #jarvis-cloud-manager .jcm-message {
      max-width:88%;
      padding:11px 13px;
      border-radius:12px;
      white-space:pre-wrap;
      overflow-wrap:anywhere;
    }

    #jarvis-cloud-manager .jcm-user {
      align-self:flex-end;
      background:#3c3d41;
    }

    #jarvis-cloud-manager .jcm-assistant {
      align-self:flex-start;
      background:#242529;
      border:1px solid #3a3b3f;
    }

    #jarvis-cloud-manager .jcm-note {
      font-size:12px;
      color:#aaaeb5;
    }

    #jarvis-cloud-manager .jcm-divider {
      width:14px;
      min-width:14px;
      cursor:col-resize;
      touch-action:none;
      display:flex;
      justify-content:center;
      align-items:center;
      user-select:none;
    }

    #jarvis-cloud-manager .jcm-divider::after {
      content:"";
      display:block;
      width:4px;
      height:68px;
      border-radius:8px;
      background:#777980;
    }

    #jarvis-cloud-manager .jcm-composer {
      display:flex;
      flex-direction:row;
      flex-wrap:nowrap;
      align-items:center;
      gap:7px;
      width:100%;
      min-width:0;
      padding:8px 10px;
      background:#242529;
      border:1px solid #48494e;
      border-radius:18px;
      flex:0 0 auto;
    }

    #jarvis-cloud-manager textarea.jcm-composer-input {
      flex:1 1 0;
      width:100%;
      min-width:0;
      min-height:24px;
      max-height:144px;
      height:24px;
      margin:0;
      padding:0 10px;
      border:0;
      border-radius:12px;
      background:#2d2e32;
      color:#f1f1f2;
      box-shadow:none;
      resize:none;
      outline:none;
      line-height:24px;
      overflow-y:hidden;
      font-size:14px;
    }

    #jarvis-cloud-manager .jcm-tool-button,
    #jarvis-cloud-manager .jcm-send-button {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      flex:0 0 32px;
      width:32px;
      height:32px;
      min-width:32px;
      margin:0;
      padding:0;
      border:0;
      border-radius:50%;
      line-height:1;
    }

    #jarvis-cloud-manager .jcm-tool-button {
      color:#d0d1d5;
      background:transparent;
      font-size:26px;
    }

    #jarvis-cloud-manager .jcm-send-button {
      background:#eeeeef;
      color:#17181a;
    }

    #jarvis-cloud-manager .jcm-tool-button:disabled,
    #jarvis-cloud-manager .jcm-send-button:disabled {
      opacity:.45;
    }

    body.jarvis-chat-active {
      overflow:hidden !important;
      overscroll-behavior:none;
    }

    body.jarvis-chat-active #chat {
      overflow:hidden;
      min-height:0;
    }

    #jarvis-cloud-manager .jcm-task-preview {
      display:grid;
      gap:9px;
      max-width:100%;
      align-self:stretch;
    }

    #jarvis-cloud-manager .jcm-task-actions {
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }
  `;

  document.head.append(style);

  const oldPanel = page.querySelector("details.panel");
  if (oldPanel) oldPanel.hidden = true;

  const root = node("div");
  root.id = "jarvis-cloud-manager";

  const side = node("div", "jcm-panel");
  const create = node("button", "btn primary", "+ Neuer Cloud-Chat");
  const search = node("input", "field");
  const list = node("div", "jcm-list");

  search.placeholder = "Cloud-Chats suchen";
  search.setAttribute("aria-label", "Cloud-Chats suchen");
  search.style.marginTop = "12px";

  const notice = node(
    "p",
    "jcm-note",
    "Cloudflare D1 · geräteübergreifend. " +
    "Bisherige lokale Chats bleiben gespeichert."
  );

  side.append(create, search, list, notice);

  const divider = node("div", "jcm-divider");
  divider.setAttribute("role", "separator");
  divider.setAttribute(
    "aria-label",
    "Chatliste vergrößern oder verkleinern"
  );
  divider.setAttribute("aria-orientation", "vertical");

  const main = node("div", "jcm-panel jcm-main");
  const title = node("strong", null, "Cloud-Chat");
  const messages = node("div", "jcm-messages");
  messages.setAttribute("role", "log");

  const input = node("textarea", "field jcm-composer-input");
  input.rows = 1;
  input.maxLength = 2000;
  input.placeholder = "Nachricht an JARVIS …";

  const status = node(
    "span",
    "jcm-note",
    "Cloud-Verbindung wird geprüft …"
  );
  status.setAttribute("role", "status");

  const plusButton = node("button", "jcm-tool-button", "+");
  plusButton.type = "button";
  plusButton.title = "Dateien und Bilder anhängen";
  plusButton.setAttribute("aria-label", "Anhänge öffnen");

  const microphone = node("button", "jcm-tool-button");
  microphone.type = "button";
  microphone.disabled = true;
  microphone.title = "Spracheingabe – später verfügbar";
  microphone.setAttribute("aria-label", "Spracheingabe");

  microphone.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3"/>
      <path d="M5 10a7 7 0 0 0 14 0"/>
      <path d="M12 17v5"/>
      <path d="M8 22h8"/>
    </svg>
  `;

  const reload = node("button", "jcm-tool-button");
  reload.type = "button";
  reload.title = "Chat aktualisieren";
  reload.setAttribute("aria-label", "Chat aktualisieren");

  reload.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="M20 11a8 8 0 1 1-2.4-5.7"/>
      <path d="M20 4v6h-6"/>
    </svg>
  `;

  const send = node("button", "jcm-send-button");
  send.type = "button";
  send.title = "Nachricht senden";
  send.setAttribute("aria-label", "Nachricht senden");

  send.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">
      <path d="M12 19V5"/>
      <path d="m5 12 7-7 7 7"/>
    </svg>
  `;

  const composer = node("div", "jcm-composer");
  composer.append(plusButton, microphone, input, reload, send);

  main.append(title, messages, composer, status);
  root.append(side, divider, main);
  page.append(root);

  let chats = [];
  let activeId = null;
  let busy = false;
  let selectionVersion = 0;

  const SIDEBAR_WIDTH_KEY = "jarvis_chat_sidebar_width";
  let sidebarWidth = 230;

  try {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (stored !== null) {
      const value = Number(stored);
      if (
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 800
      ) {
        sidebarWidth = value;
      }
    }
  } catch {}

  function applySidebarWidth(width) {
    const maxWidth = Math.max(
      140,
      Math.floor(root.clientWidth * 0.6)
    );

    sidebarWidth = width < 70
      ? 0
      : Math.max(140, Math.min(width, maxWidth));

    side.style.visibility =
      sidebarWidth === 0 ? "hidden" : "visible";

    side.style.pointerEvents =
      sidebarWidth === 0 ? "none" : "auto";

    root.style.gridTemplateColumns =
      sidebarWidth + "px 14px minmax(0,1fr)";
  }

  applySidebarWidth(sidebarWidth);

  let draggingDivider = false;

  divider.addEventListener("pointerdown", event => {
    if (
      event.pointerType === "mouse" &&
      event.button !== 0
    ) return;

    draggingDivider = true;
    divider.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  divider.addEventListener("pointermove", event => {
    if (!draggingDivider) return;

    const bounds = root.getBoundingClientRect();
    applySidebarWidth(event.clientX - bounds.left);
  });

  function finishDividerDrag() {
    if (!draggingDivider) return;
    draggingDivider = false;

    try {
      localStorage.setItem(
        SIDEBAR_WIDTH_KEY,
        String(sidebarWidth)
      );
    } catch {}
  }

  divider.addEventListener("pointerup", finishDividerDrag);
  divider.addEventListener("pointercancel", finishDividerDrag);
  divider.addEventListener(
    "lostpointercapture",
    finishDividerDrag
  );

  function setStatus(message) {
    status.textContent = message;
  }

  function setBusy(value) {
    busy = value;
    create.disabled = value;
    send.disabled = value || !activeId;
    reload.disabled = value;

    // Schreiben bleibt während der KI-Antwort möglich.
    input.disabled = false;
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "HTTP " + response.status);
    }

    return data;
  }

  function resizeComposerInput() {
    input.style.height = "24px";

    const height = Math.min(
      Math.max(input.scrollHeight, 24),
      144
    );

    input.style.height = height + "px";
    input.style.overflowY =
      input.scrollHeight > 144 ? "auto" : "hidden";
  }

  input.addEventListener("input", resizeComposerInput);
  resizeComposerInput();

  plusButton.onclick = () => {
    setStatus(
      "Datei-Uploads sind noch nicht verbunden. " +
      "Der Cloud-Chat unterstützt derzeit Text."
    );
  };

  function renderList() {
    list.replaceChildren();

    const query = search.value.trim().toLowerCase();

    for (const chat of chats.filter(c =>
      c.title.toLowerCase().includes(query)
    )) {
      const button = node(
        "button",
        "jcm-chat",
        chat.title
      );

      button.type = "button";
      button.style.flex = "1";
      button.style.minWidth = "0";

      if (chat.id === activeId) {
        button.classList.add("active");
        button.setAttribute("aria-current", "true");
      }

      button.onclick = () => {
        if (!busy) openChat(chat.id);
      };

      const row = node("div");
      row.style.display = "flex";
      row.style.gap = "6px";
      row.style.alignItems = "center";

      const remove = node("button", "btn quiet");
      remove.type = "button";
      remove.title = "Chat löschen";
      remove.style.padding = "10px";
      remove.style.display = "inline-flex";
      remove.style.alignItems = "center";
      remove.style.justifyContent = "center";
      remove.style.flexShrink = "0";
      remove.style.color = "#c6c7ce";

      remove.setAttribute(
        "aria-label",
        "Chat löschen: " + chat.title
      );

      remove.innerHTML = `
        <svg width="17" height="17" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="1.8"
          stroke-linecap="round" stroke-linejoin="round"
          aria-hidden="true">
          <path d="M3 6h18"/>
          <path d="M8 6V4h8v2"/>
          <path d="M19 6l-1 14H6L5 6"/>
          <path d="M10 10v6"/>
          <path d="M14 10v6"/>
        </svg>
      `;

      remove.onclick = async () => {
        if (busy) return;

        if (!confirm(
          'Chat "' + chat.title +
          '" und alle Nachrichten endgültig löschen?'
        )) return;

        setBusy(true);
        setStatus("Chat wird gelöscht …");

        try {
          const result = await api(
            "/api/conversation-delete",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                chatId: chat.id
              })
            }
          );

          if (result.deleted !== true) {
            throw new Error("Löschen nicht bestätigt");
          }

          if (activeId === chat.id) {
            ++selectionVersion;
            activeId = null;
            messages.replaceChildren();
            title.textContent = "Cloud-Chat";
          }

          await loadChats();

          setBusy(false);

          if (!activeId && chats.length) {
            await openChat(chats[0].id);
          } else if (!chats.length) {
            setStatus("Keine Cloud-Chats vorhanden.");
          } else {
            setStatus("Chat gelöscht.");
          }

        } catch (error) {
          setStatus(
            "Löschen fehlgeschlagen: " + error.message
          );
        } finally {
          setBusy(false);
        }
      };

      row.append(remove, button);
      list.append(row);
    }
  }

  async function loadChats() {
    const data = await api("/api/conversations");

    chats = Array.isArray(data.chats)
      ? data.chats
      : [];

    renderList();
  }

  async function openChat(id) {
    if (busy) return;

    const version = ++selectionVersion;
    activeId = id;

    const chat = chats.find(c => c.id === id);
    title.textContent = chat?.title || "Cloud-Chat";

    messages.replaceChildren();
    send.disabled = true;
    renderList();

    try {
      const data = await api(
        "/api/messages?chatId=" +
        encodeURIComponent(id)
      );

      if (version !== selectionVersion) return;

      for (const message of data.messages || []) {
        messages.append(node(
          "div",
          "jcm-message " +
          (message.role === "user"
            ? "jcm-user"
            : "jcm-assistant"),
          message.content
        ));
      }

      if (!data.messages?.length) {
        messages.append(node(
          "p",
          "jcm-note",
          "Neues Gespräch. Schreib deine erste Nachricht."
        ));
      }

      messages.scrollTop = messages.scrollHeight;
      setStatus("Cloud-Chat geladen.");

    } catch (error) {
      if (version === selectionVersion) {
        setStatus(
          "Laden fehlgeschlagen: " + error.message
        );
      }
    } finally {
      if (version === selectionVersion) {
        send.disabled = busy || !activeId;
      }
    }
  }

  create.onclick = async () => {
    if (busy) return;

    setBusy(true);

    try {
      const data = await api(
        "/api/conversations",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title: "Neuer Chat"
          })
        }
      );

      await loadChats();

      setBusy(false);
      await openChat(data.chat.id);
      input.focus();

    } catch (error) {
      setStatus(
        "Chat konnte nicht erstellt werden: " +
        error.message
      );
    } finally {
      setBusy(false);
    }
  };

  search.oninput = renderList;

  reload.onclick = async () => {
    if (busy) return;

    try {
      await loadChats();

      if (
        activeId &&
        chats.some(c => c.id === activeId)
      ) {
        await openChat(activeId);
      } else if (chats.length) {
        await openChat(chats[0].id);
      } else {
        setStatus("Noch keine Cloud-Chats vorhanden.");
      }

    } catch (error) {
      setStatus(
        "Aktualisierung fehlgeschlagen: " +
        error.message
      );
    }
  };

  // Eindeutige Aufgabenbefehle erkennen.
  function parseTaskCommand(message) {
    const match = message.match(
      /^\s*(?:jarvis\s*[,!:–-]?\s*)?(?:bitte\s+)?(?:erstelle|erstell|lege|speichere|notiere)\s+(?:mir\s+)?(?:bitte\s+)?(?:eine?n?\s+)?(?:(wichtige|dringende|unwichtige)\s+)?aufgabe(?:\s+an)?\s*[:,-]?\s*(.+)$/is
    );

    if (!match) return null;

    let taskTitle = match[2].trim();
    const importance =
      match[1]?.toLowerCase() || "";

    const priority =
      /unwichtig/i.test(importance)
        ? "low"
        : /wichtig|dringend/i.test(importance)
          ? "high"
          : "normal";

    let due = "";

    const relative = taskTitle.match(
      /^(übermorgen|morgen)\b\s*[,.:–-]?\s*/i
    );

    if (relative) {
      const date = new Date();
      date.setHours(12, 0, 0, 0);

      date.setDate(
        date.getDate() +
        (
          relative[1].toLowerCase() === "übermorgen"
            ? 2
            : 1
        )
      );

      const pad = n =>
        String(n).padStart(2, "0");

      due =
        date.getFullYear() + "-" +
        pad(date.getMonth() + 1) + "-" +
        pad(date.getDate());

      taskTitle =
        taskTitle.slice(relative[0].length).trim();
    }

    taskTitle = taskTitle
      .replace(/[.!]+$/, "")
      .trim();

    if (
      !taskTitle ||
      taskTitle.length > 160
    ) return null;

    return {
      title: taskTitle,
      priority,
      due,
      area: "Allgemein",
      source: "chat"
    };
  }

  // Aufgabe erst nach Bestätigung speichern.
  function showTaskConfirmation(task, originalText) {
    const preview = node(
      "div",
      "jcm-message jcm-assistant jcm-task-preview"
    );

    preview.append(
      node("strong", null, "Aufgabe zur Freigabe")
    );

    preview.append(
      node("div", null, task.title)
    );

    const priorityLabel =
      task.priority === "high" ? "Wichtig" :
      task.priority === "low" ? "Später" :
      "Normal";

    preview.append(node(
      "small",
      "jcm-note",
      "Bereich: " + task.area +
      " · Priorität: " + priorityLabel +
      " · Fällig: " + (task.due || "Kein Datum")
    ));

    preview.append(node(
      "small",
      "jcm-note",
      "Erst nach deiner Bestätigung in Cloudflare D1 gespeichert."
    ));

    const actions = node(
      "div",
      "jcm-task-actions"
    );

    const approve = node(
      "button",
      "btn primary",
      "Aufgabe speichern"
    );

    const cancel = node(
      "button",
      "btn quiet",
      "Abbrechen"
    );

    approve.type = "button";
    cancel.type = "button";

    actions.append(approve, cancel);
    preview.append(actions);
    messages.append(preview);

    messages.scrollTop = messages.scrollHeight;

    const originChatId = activeId;

    cancel.onclick = () => {
      preview.remove();

      if (!input.value.trim()) {
        input.value = originalText;
        resizeComposerInput();
      }

      setStatus("Aufgabe nicht gespeichert.");
    };

    approve.onclick = async () => {
      if (busy || originChatId !== activeId) {
        setStatus(
          "Bitte zuerst die laufende Anfrage beenden."
        );
        return;
      }

      approve.disabled = true;
      cancel.disabled = true;

      setStatus(
        "Aufgabe wird in Cloudflare D1 gespeichert …"
      );

      try {
        const data = await api("/api/tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(task)
        });

        if (
          data.success !== true ||
          !data.task?.id
        ) {
          throw new Error(
            "Speicherung nicht bestätigt"
          );
        }

        preview.replaceChildren(
          node(
            "strong",
            null,
            "Aufgabe erfolgreich gespeichert"
          ),
          node("div", null, data.task.title),
          node(
            "small",
            "jcm-note",
            "Die Aufgabe ist jetzt in Cloudflare D1 gespeichert."
          )
        );

        setStatus(
          "Aufgabe in Cloudflare D1 gespeichert."
        );

      } catch (error) {
        approve.disabled = false;
        cancel.disabled = false;

        setStatus(
          "Aufgabe nicht gespeichert: " +
          error.message
        );
      }
    };
  }

  function generateChatTitle(message) {
    const clean = message
      .replace(/\s+/g, " ")
      .trim();

    const project = clean.match(
      /\bProjekt\s+([\p{L}\p{N}-]+)/iu
    );

    if (project) {
      return (
        /\bApp\b/i.test(clean)
          ? project[1] + " App"
          : "Projekt " + project[1]
      ).slice(0, 40);
    }

    if (/Second Brain/i.test(clean)) {
      return "Second Brain";
    }

    if (/Automatisierung/i.test(clean)) {
      return "Automatisierung";
    }

    if (/E-Mail|Mail/i.test(clean)) {
      return "E-Mails";
    }

    if (/\bApp\b/i.test(clean)) {
      return "App Entwicklung";
    }

    const stopWords = new Set([
      "ich", "möchte", "will", "bitte",
      "kannst", "du", "mir", "eine",
      "einen", "ein", "der", "die",
      "das", "und", "für", "mein",
      "meine", "mit", "über", "was",
      "wie", "ist", "soll", "sollst",
      "helfen"
    ]);

    const words = clean
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .split(/\s+/)
      .filter(word =>
        word.length > 2 &&
        !stopWords.has(word.toLowerCase())
      );

    return (
      words.slice(0, 2).join(" ") ||
      "Neues Thema"
    ).slice(0, 40);
  }

  send.onclick = async () => {
    if (!activeId || busy) {
      setStatus(
        "Bitte zuerst einen Cloud-Chat auswählen."
      );
      return;
    }

    const message = input.value.trim();

    if (
      message.length < 5 ||
      message.length > 2000
    ) {
      setStatus(
        "Bitte 5 bis 2000 Zeichen eingeben."
      );
      return;
    }

    // Expliziter Aufgabenbefehl: Vorschau statt KI-Anfrage.
    const task = parseTaskCommand(message);

    
if (task) {
  const taskChatId = activeId;

  setBusy(true);
  setStatus("JARVIS speichert deine Aufgabe …");

  try {
    const data = await api("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(task)
    });

    if (
      data.success !== true ||
      !data.task?.id
    ) {
      throw new Error("Speicherung nicht bestätigt");
    }

    // Erst nach bestätigter Speicherung
    // die Eingabe leeren.
    if (input.value.trim() === message) {
      input.value = "";
      resizeComposerInput();
    }

    // Erfolg direkt im Chat anzeigen.
    if (activeId === taskChatId) {
      const result = node(
        "div",
        "jcm-message jcm-assistant",
        "✓ Aufgabe gespeichert: " + data.task.title +
        (data.task.due
          ? "\nFällig: " + data.task.due
          : "") +
        "\nDu findest sie unter Meine Aufgaben."
      );

      messages.append(result);
      messages.scrollTop = messages.scrollHeight;
    }

    setStatus("Aufgabe in Cloudflare D1 gespeichert.");

    // Aufgabenansicht über neue Daten informieren.
    window.dispatchEvent(
      new CustomEvent("jarvis:tasks-updated", {
        detail: { task: data.task }
      })
    );

  } catch (error) {
    setStatus(
      "Aufgabe konnte nicht bestätigt gespeichert werden: " +
      error.message +
      ". Bitte vor einem erneuten Versuch " +
      "die Aufgabenliste überprüfen."
    );
  } finally {
    setBusy(false);
  }

  return;
}


    const selected = document.querySelector(
      'input[name="model"]:checked'
    )?.value || "llama";

    if (!["llama", "auto"].includes(selected)) {
      setStatus(
        "Dieses KI-Modell ist noch nicht verbunden."
      );
      return;
    }

    const chatId = activeId;

    const shouldAutoRename =
      chats.find(c => c.id === chatId)
        ?.title === "Neuer Chat";

    const generatedTitle =
      generateChatTitle(message);

    setBusy(true);
    setStatus("JARVIS denkt …");

    const pendingMessage = node(
      "div",
      "jcm-message jcm-user",
      message
    );

    messages.append(pendingMessage);
    messages.scrollTop = messages.scrollHeight;

    // Nur die bereits gesendete Nachricht entfernen.
    input.value = "";
    resizeComposerInput();

    try {
      const data = await api(
        "/api/conversation-turn",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chatId,
            message,
            model: selected
          })
        }
      );

      if (data.saved !== true) {
        throw new Error(
          "Speicherung nicht bestätigt"
        );
      }
      if (data.action === "create_task") {
  window.dispatchEvent(
    new CustomEvent("jarvis:tasks-updated")
  );
}

      if (shouldAutoRename) {
        try {
          await api(
            "/api/conversation-rename",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                chatId,
                title: generatedTitle
              })
            }
          );
        } catch {
          console.warn(
            "Automatische Benennung fehlgeschlagen"
          );
        }
      }

      await loadChats();

      setBusy(false);
      await openChat(chatId);

      setStatus(
        "Nachricht gespeichert · Modell: " +
        (data.model || "nicht angegeben")
      );

    } catch (error) {
      pendingMessage.remove();

      // Einen inzwischen geschriebenen Entwurf nicht löschen.
      if (!input.value.trim()) {
        input.value = message;
        resizeComposerInput();
      }

      setStatus(
        "Senden nicht bestätigt: " +
        error.message +
        " – Bitte vor erneutem Senden Chat aktualisieren."
      );

    } finally {
      setBusy(false);
    }
  };

  input.addEventListener("keydown", event => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      send.click();
    }
  });

  function resizeJarvisChat() {
    if (page.hidden) return;

    const bottomNav =
      document.getElementById("bottomnav");

    const bottomHeight =
      bottomNav &&
      getComputedStyle(bottomNav).display !== "none"
        ? bottomNav.getBoundingClientRect().height
        : 0;

    const top = root.getBoundingClientRect().top;

    const available =
      window.innerHeight - top - bottomHeight - 10;

    const height = Math.max(180, available);

    root.style.height = height + "px";
    root.style.maxHeight = height + "px";
  }

  function syncJarvisChatLayout() {
    const visible = !page.hidden;

    document.body.classList.toggle(
      "jarvis-chat-active",
      visible
    );

    if (visible) {
      resizeJarvisChat();
      applySidebarWidth(sidebarWidth);
    } else {
      root.style.height = "";
      root.style.maxHeight = "";
    }
  }

  const chatVisibilityObserver =
    new MutationObserver(syncJarvisChatLayout);

  chatVisibilityObserver.observe(page, {
    attributes: true,
    attributeFilter: ["hidden"]
  });

  window.addEventListener(
    "resize",
    syncJarvisChatLayout
  );

  loadChats()
    .then(async () => {
      if (chats.length) {
        await openChat(chats[0].id);
      } else {
        setStatus(
          "Bereit. Erstelle deinen ersten Cloud-Chat."
        );
      }
    })
    .catch(error => {
      setStatus(
        "Cloud-Verbindung fehlgeschlagen: " +
        error.message
      );
    });

  syncJarvisChatLayout();
})();
