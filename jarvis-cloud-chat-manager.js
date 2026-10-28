
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

  actions.append(send, reload);
  main.append(title, messages, input, actions, status);
  root.append(side, main);
  page.append(root);

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

const generatedTitle = message
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 60);
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
})();
