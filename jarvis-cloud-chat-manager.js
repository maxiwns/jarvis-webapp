
/* JARVIS 0.9 – Cloud-Chat in der Hauptoberfläche */
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
    #jarvis-cloud-manager {
      display:grid;
      grid-template-columns:minmax(170px,230px) minmax(0,1fr);
      gap:12px;
    }
    #jarvis-cloud-manager .jcm-panel {
      background:#1c1d20;
      border:1px solid #3a3b40;
      border-radius:14px;
      padding:14px;
      min-width:0;
    }
    #jarvis-cloud-manager .jcm-list {
      display:grid;
      gap:6px;
      max-height:450px;
      overflow:auto;
      margin-top:12px;
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
    }
    #jarvis-cloud-manager .jcm-messages {
      display:flex;
      flex-direction:column;
      gap:12px;
      height:370px;
      overflow:auto;
      padding:8px 0;
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
    #jarvis-cloud-manager textarea {
      min-height:90px;
      resize:vertical;
    }
    @media(max-width:700px) {
      #jarvis-cloud-manager {
        grid-template-columns:1fr;
      }
      #jarvis-cloud-manager .jcm-list {
        max-height:125px;
      }
      #jarvis-cloud-manager .jcm-messages {
        height:330px;
      }
      
#jarvis-cloud-manager .jcm-composer {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex-shrink: 0;
  background: #242529;
  border: 1px solid #48494e;
  border-radius: 17px;
  padding: 10px 12px;
}

#jarvis-cloud-manager .jcm-composer-input {
  min-height: 24px;
  height: 24px;
  max-height: 160px;
  width: 100%;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: #f1f1f2;
  padding: 0;
  line-height: 24px;
  box-shadow: none;
}

#jarvis-cloud-manager .jcm-composer-tools {
  display: flex;
  align-items: center;
  gap: 9px;
}

#jarvis-cloud-manager .jcm-tool-button {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: #e5e5e8;
  font-size: 26px;
}

#jarvis-cloud-manager .jcm-tool-button:disabled {
  opacity: 0.35;
}

#jarvis-cloud-manager .jcm-send-button {
  margin-left: auto;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: #eeeeef;
  color: #17181a;
  font-size: 23px;
  font-weight: bold;
}

#jarvis-cloud-manager .jcm-send-button:disabled {
  opacity: 0.45;
}

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
  search.placeholder = "Cloud-Chats suchen";
  search.setAttribute("aria-label", "Cloud-Chats suchen");
  search.style.marginTop = "12px";

  const list = node("div", "jcm-list");
  const notice = node(
    "p",
    "jcm-note",
    "Cloudflare D1 · geräteübergreifend. " +
    "Bisherige lokale Chats bleiben gespeichert."
  );

  side.append(create, search, list, notice);

  const main = node("div", "jcm-panel jcm-main");
  const title = node("strong", null, "Cloud-Chat");
  const messages = node("div", "jcm-messages");
  messages.setAttribute("role", "log");

  const input = node("textarea", "field");
  input.placeholder = "Schreib JARVIS eine Nachricht …";
  input.maxLength = 2000;

  const actions = node("div", "line");
  const status = node("span", "jcm-note", "Cloud-Verbindung wird geprüft …");
  status.setAttribute("role", "status");

  const send = node("button", "btn primary", "Senden");
  const reload = node("button", "btn quiet", "Aktualisieren");

  
// Kompakte JARVIS-Eingabeleiste
const composer = node("div", "jcm-composer");
const composerTools = node("div", "jcm-composer-tools");

const plusButton = node("button", "jcm-tool-button", "+");
plusButton.type = "button";
plusButton.title = "Dateien und Bilder anhängen";
plusButton.setAttribute("aria-label", "Anhänge öffnen");

const microphone = node("button", "jcm-tool-button", "♩");
microphone.type = "button";
microphone.title = "Spracheingabe – später verfügbar";
microphone.setAttribute("aria-label", "Spracheingabe");
microphone.disabled = true;

input.rows = 1;
input.placeholder = "Nachricht an JARVIS …";
input.classList.add("jcm-composer-input");

send.textContent = "↑";
send.className = "jcm-send-button";
send.setAttribute("aria-label", "Nachricht senden");
send.title = "Nachricht senden";

// Anhänge werden erst nach Backend-Anbindung unterstützt.
plusButton.onclick = () => {
  setStatus(
    "Bilder und Dokumente folgen mit der Datei-Upload-Funktion. " +
    "Aktuell unterstützt der Cloud-Chat nur Text."
  );
};

composerTools.append(plusButton, microphone, send);
composer.append(input, composerTools);

main.append(title, messages, composer, reload, status);

// Textfeld wächst automatisch mit dem Inhalt.
function resizeComposerInput() {
  input.style.height = "auto";
  input.style.height =
    Math.min(input.scrollHeight, 160) + "px";
  input.style.overflowY =
    input.scrollHeight > 160 ? "auto" : "hidden";
}

input.addEventListener("input", resizeComposerInput);
resizeComposerInput();

  root.append(side, main);
  page.append(root);

// JARVIS – Kompakte Kopfzeile und verschiebbare Chatliste

const splitStyle = node("style");

splitStyle.textContent = `
  /* Großen KI-Chat-Kasten nur auf der Chatseite ausblenden */
  #chat > .hero {
    display: none;
  }

  /* Verschiebbare Trennleiste */
  #jarvis-cloud-manager .jcm-divider {
    width: 14px;
    min-width: 14px;
    cursor: col-resize;
    touch-action: none;
    display: flex;
    justify-content: center;
    align-items: center;
    user-select: none;
  }

  #jarvis-cloud-manager .jcm-divider::after {
    content: "";
    display: block;
    width: 4px;
    height: 68px;
    border-radius: 8px;
    background: #777980;
  }

  #jarvis-cloud-manager .jcm-divider:hover::after {
    background: #c6c7ce;
  }

  #jarvis-cloud-manager > .jcm-panel:first-child {
    min-width: 0;
  }

  #jarvis-cloud-manager .jcm-main {
    min-width: 0;
  }
`;

document.head.append(splitStyle);

// Trennleiste zwischen Chatliste und Chat setzen
const divider = node("div", "jcm-divider");

divider.setAttribute("role", "separator");
divider.setAttribute("aria-label", "Chatliste vergrößern oder verkleinern");
divider.setAttribute("aria-orientation", "vertical");

root.insertBefore(divider, main);

// Breite der Chatliste merken
const SIDEBAR_WIDTH_KEY = "jarvis_chat_sidebar_width";

let sidebarWidth = 230;

try {
  const storedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
const savedWidth = storedWidth === null
  ? 230
  : Number(storedWidth);

  if (Number.isFinite(savedWidth) &&
      savedWidth >= 0 &&
      savedWidth <= 800) {
    sidebarWidth = savedWidth;
  }
} catch {}

// Tatsächliche Breite anwenden
function applySidebarWidth(width) {
  const maxWidth = Math.max(
    140,
    Math.floor(root.clientWidth * 0.6)
  );

  sidebarWidth = width < 70
    ? 0
    : Math.max(140, Math.min(width, maxWidth));

  side.hidden = false;
side.style.visibility = sidebarWidth === 0
  ? "hidden"
  : "visible";
side.style.pointerEvents = sidebarWidth === 0
  ? "none"
  : "auto";

  root.classList.remove("jcm-collapsed");

  root.style.gridTemplateColumns =
    sidebarWidth + "px 14px minmax(0, 1fr)";
}

// Beim ersten Laden anwenden
applySidebarWidth(sidebarWidth);

let draggingDivider = false;

divider.addEventListener("pointerdown", event => {
  if (event.button !== 0 &&
      event.pointerType === "mouse") return;

  draggingDivider = true;

  divider.setPointerCapture(event.pointerId);
  event.preventDefault();
});

divider.addEventListener("pointermove", event => {
  if (!draggingDivider) return;

  const bounds = root.getBoundingClientRect();

  const newWidth = event.clientX - bounds.left;

  applySidebarWidth(newWidth);
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
divider.addEventListener("lostpointercapture", finishDividerDrag);

// Breite bei Bildschirmdrehung korrigieren
window.addEventListener("resize", () => {
  applySidebarWidth(sidebarWidth);
});

  let chats = [];
  let activeId = null;
  let busy = false;
  let selectionVersion = 0;

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

  function setStatus(message) {
    status.textContent = message;
  }

  function setBusy(value) {
    busy = value;
    create.disabled = value;
    send.disabled = value || !activeId;
    reload.disabled = value;
    input.disabled = value;
  }

  function renderList() {
    list.replaceChildren();
    const query = search.value.trim().toLowerCase();

    for (const chat of chats.filter(c =>
      c.title.toLowerCase().includes(query)
    )) {
      const button = node("button", "jcm-chat", chat.title);
      button.type = "button";

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

button.style.flex = "1";
button.style.minWidth = "0";

const remove = node("button", "btn quiet");

remove.innerHTML = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="17"
    height="17"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18"/>
    <path d="M8 6V4h8v2"/>
    <path d="M19 6l-1 14H6L5 6"/>
    <path d="M10 10v6"/>
    <path d="M14 10v6"/>
  </svg>
`;

remove.style.display = "inline-flex";
remove.style.alignItems = "center";
remove.style.justifyContent = "center";
remove.style.flexShrink = "0";
remove.style.padding = "10px";
remove.style.color = "#c6c7ce";
remove.type = "button";
remove.title = "Chat löschen";
remove.setAttribute(
  "aria-label",
  "Chat löschen: " + chat.title
);

remove.onclick = async () => {
  if (busy) return;

  if (!confirm(
    'Chat "' + chat.title +
    '" und alle Nachrichten endgültig löschen?'
  )) return;

  setBusy(true);
  setStatus("Chat wird gelöscht …");

  try {
    const result = await api("/api/conversation-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ chatId: chat.id })
    });

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
    setStatus("Löschen fehlgeschlagen: " + error.message);
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
    chats = Array.isArray(data.chats) ? data.chats : [];
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
        "/api/messages?chatId=" + encodeURIComponent(id)
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
        setStatus("Laden fehlgeschlagen: " + error.message);
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
      const data = await api("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Neuer Chat" })
      });

      await loadChats();

      setBusy(false);
      await openChat(data.chat.id);
      input.focus();
    } catch (error) {
      setStatus("Chat konnte nicht erstellt werden: " + error.message);
    } finally {
      setBusy(false);
    }
  };

  search.oninput = renderList;

  reload.onclick = async () => {
    if (busy) return;
    try {
      await loadChats();

      if (activeId && chats.some(c => c.id === activeId)) {
        await openChat(activeId);
      } else if (chats.length) {
        await openChat(chats[0].id);
      } else {
        setStatus("Noch keine Cloud-Chats vorhanden.");
      }
    } catch (error) {
      setStatus("Aktualisierung fehlgeschlagen: " + error.message);
    }
  };

  send.onclick = async () => {
    if (!activeId || busy) {
      setStatus("Bitte zuerst einen Cloud-Chat auswählen.");
      return;
    }

    const message = input.value.trim();

    if (message.length < 5 || message.length > 2000) {
      setStatus("Bitte 5 bis 2000 Zeichen eingeben.");
      return;
    }

    const selected = document.querySelector(
      'input[name="model"]:checked'
    )?.value || "llama";

    if (!["llama", "auto"].includes(selected)) {
      setStatus("Dieses KI-Modell ist noch nicht verbunden.");
      return;
    }
const shouldAutoRename =
  chats.find(chat => chat.id === activeId)?.title === "Neuer Chat";


// Kurzen Chatnamen aus dem Thema ableiten
const cleanMessage = message.replace(/\s+/g, " ").trim();

let generatedTitle = "Neues Thema";

const projectMatch = cleanMessage.match(
  /\bProjekt\s+([\p{L}\p{N}-]+)/iu
);

if (projectMatch) {
  generatedTitle = /\bApp\b/i.test(cleanMessage)
    ? projectMatch[1] + " App"
    : "Projekt " + projectMatch[1];

} else if (/Second Brain/i.test(cleanMessage)) {
  generatedTitle = "Second Brain";

} else if (/Automatisierung/i.test(cleanMessage)) {
  generatedTitle = "Automatisierung";

} else if (/E-Mail|Mail/i.test(cleanMessage)) {
  generatedTitle = "E-Mails";

} else if (/\bApp\b/i.test(cleanMessage)) {
  generatedTitle = "App Entwicklung";

} else {
  const stopWords = new Set([
    "ich", "möchte", "will", "bitte", "kannst",
    "du", "mir", "eine", "einen", "ein", "der",
    "die", "das", "und", "für", "mein",
    "meine", "mit", "über", "was", "wie",
    "ist", "soll", "sollst", "helfen"
  ]);

  const words = cleanMessage
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .filter(word =>
      word.length > 2 &&
      !stopWords.has(word.toLowerCase())
    );

  generatedTitle =
    words.slice(0, 2).join(" ") || "Neues Thema";
}

generatedTitle = generatedTitle.slice(0, 40);

    setBusy(true);
setStatus("JARVIS denkt …");

// Nachricht sofort anzeigen, noch bevor die KI antwortet
const pendingMessage = node(
  "div",
  "jcm-message jcm-user",
  message
);

messages.append(pendingMessage);
messages.scrollTop = messages.scrollHeight;
input.value = "";

try {
      const data = await api("/api/conversation-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: activeId,
          message,
          model: selected
        })
      });

      if (data.saved !== true) {
        throw new Error("Speicherung nicht bestätigt");
      }
      if (shouldAutoRename) {
  try {
    await api("/api/conversation-rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chatId: activeId,
        title: generatedTitle
      })
    });
  } catch (renameError) {
    console.warn("Automatische Benennung fehlgeschlagen");
  }
}
      input.value = "";
      await loadChats();

      setBusy(false);
      await openChat(activeId);

      setStatus(
        "Nachricht gespeichert · Modell: " +
        (data.model || "nicht angegeben")
      );
    } catch (error) {
  pendingMessage.remove();
  input.value = message;

  setStatus(
    "Senden nicht bestätigt: " + error.message +
    " – Bitte vor einem erneuten Versuch den Chat aktualisieren."
  );
} finally {
      setBusy(false);
    }
  };

  input.addEventListener("keydown", event => {
    if (event.key === "Enter" &&
        (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      send.click();
    }
  });

  loadChats()
    .then(async () => {
      if (chats.length) {
        await openChat(chats[0].id);
      } else {
        setStatus("Bereit. Erstelle deinen ersten Cloud-Chat.");
      }
    })
    .catch(error => {
      setStatus("Cloud-Verbindung fehlgeschlagen: " + error.message);
    });
  
// JARVIS – Feste Chatansicht und Wisch-Navigation

const chatLayoutStyle = node("style");

chatLayoutStyle.textContent = `
  body.jarvis-chat-active {
    overflow: hidden !important;
    overscroll-behavior: none;
  }

  body.jarvis-chat-active #chat {
    overflow: hidden;
    min-height: 0;
  }

  #jarvis-cloud-manager {
    min-height: 0;
    overflow: hidden;
    grid-template-columns: 230px minmax(0, 1fr);
    transition: grid-template-columns 0.22s ease;
  }

  #jarvis-cloud-manager .jcm-panel {
    min-height: 0;
  }

  #jarvis-cloud-manager .jcm-panel:first-child {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #jarvis-cloud-manager .jcm-list {
    flex: 1;
    min-height: 0;
    max-height: none;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  #jarvis-cloud-manager .jcm-main {
    min-height: 0;
    overflow: hidden;
  }

  #jarvis-cloud-manager .jcm-messages {
    flex: 1;
    min-height: 0;
    height: auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  #jarvis-cloud-manager textarea {
    flex-shrink: 0;
  }

  #jarvis-cloud-manager .jcm-main > .line {
    flex-shrink: 0;
  }

  #jarvis-cloud-manager.jcm-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  #jarvis-cloud-manager.jcm-collapsed
  > .jcm-panel:first-child {
    display: none;
  }

  @media (max-width: 700px) {
    #jarvis-cloud-manager {
      grid-template-columns: minmax(130px, 36%) minmax(0, 1fr);
    }

    #jarvis-cloud-manager.jcm-collapsed {
      grid-template-columns: minmax(0, 1fr);
    }
  }
`;

document.head.append(chatLayoutStyle);

// Verfügbare Bildschirmhöhe für den Chat berechnen.
function resizeJarvisChat() {
  if (page.hidden) return;

  const bottomNav = document.getElementById("bottomnav");

  const bottomHeight =
    bottomNav &&
    getComputedStyle(bottomNav).display !== "none"
      ? bottomNav.getBoundingClientRect().height
      : 0;

  const top = root.getBoundingClientRect().top;
  const available =
    window.innerHeight - top - bottomHeight - 10;

  root.style.height =
    Math.max(180, available) + "px";

  root.style.maxHeight =
    Math.max(180, available) + "px";
}

function syncJarvisChatLayout() {
  const visible = !page.hidden;

  document.body.classList.toggle(
    "jarvis-chat-active",
    visible
  );

  if (visible) {
    resizeJarvisChat();
  } else {
    root.style.height = "";
    root.style.maxHeight = "";
  }
}

// Bei Seitenwechsel und Bildschirmgrößenänderung.
const chatVisibilityObserver = new MutationObserver(
  syncJarvisChatLayout
);

chatVisibilityObserver.observe(page, {
  attributes: true,
  attributeFilter: ["hidden"]
});

window.addEventListener(
  "resize",
  syncJarvisChatLayout
);

syncJarvisChatLayout();

})();
