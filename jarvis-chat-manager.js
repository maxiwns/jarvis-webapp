
/* JARVIS 0.9 – Chatverwaltung, lokale Testversion */
(() => {
  "use strict";

  const page = document.getElementById("chat");
  if (!page || document.getElementById("jarvis-chat-manager")) return;

  // Alten Chat ausblenden, aber nicht löschen.
  const oldPanel = page.querySelector("details.panel");
  if (oldPanel) oldPanel.hidden = true;

  const KEY = "jarvis09_conversations_v1";
  const MAX_CHATS = 40;
  const MAX_MESSAGES = 80;

  const node = (tag, className, content) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) el.textContent = content;
    return el;
  };

  const uid = () => crypto.randomUUID();

  const css = node("style");
  css.textContent = `
    #jarvis-chat-manager {
      display:grid;
      grid-template-columns:minmax(180px,240px) minmax(0,1fr);
      gap:12px;
      min-height:510px;
    }
    #jarvis-chat-manager .jc-side,
    #jarvis-chat-manager .jc-main {
      background:#1c1d20;
      border:1px solid #3a3b40;
      border-radius:14px;
      padding:14px;
      min-width:0;
    }
    #jarvis-chat-manager .jc-side {
      display:flex;
      flex-direction:column;
      gap:10px;
    }
    #jarvis-chat-manager .jc-list {
      display:flex;
      flex-direction:column;
      gap:5px;
      max-height:520px;
      overflow:auto;
    }
    #jarvis-chat-manager .jc-chat {
      background:#292a2e;
      border:1px solid transparent;
      color:#ededee;
      border-radius:9px;
      padding:10px;
      text-align:left;
      cursor:pointer;
      font:inherit;
      overflow-wrap:anywhere;
    }
    #jarvis-chat-manager .jc-chat[aria-current="true"] {
      border-color:#898a90;
      background:#38393d;
    }
    #jarvis-chat-manager .jc-main {
      display:flex;
      flex-direction:column;
      gap:12px;
    }
    #jarvis-chat-manager .jc-head {
      display:flex;
      align-items:center;
      gap:8px;
      flex-wrap:wrap;
    }
    #jarvis-chat-manager .jc-title {
      font-size:17px;
      font-weight:650;
      flex:1;
      min-width:130px;
      overflow-wrap:anywhere;
    }
    #jarvis-chat-manager .jc-messages {
      height:390px;
      overflow:auto;
      display:flex;
      flex-direction:column;
      gap:14px;
      padding:8px 2px;
    }
    #jarvis-chat-manager .jc-message {
      max-width:88%;
      white-space:pre-wrap;
      overflow-wrap:anywhere;
      line-height:1.55;
      border-radius:12px;
      padding:11px 13px;
    }
    #jarvis-chat-manager .jc-user {
      align-self:flex-end;
      background:#3c3d41;
      color:#fff;
    }
    #jarvis-chat-manager .jc-assistant {
      align-self:flex-start;
      background:#242529;
      border:1px solid #3a3b3f;
      color:#f1f1f1;
    }
    #jarvis-chat-manager .jc-compose {
      display:flex;
      flex-direction:column;
      gap:8px;
    }
    #jarvis-chat-manager .jc-compose textarea {
      width:100%;
      min-height:88px;
      resize:vertical;
    }
    #jarvis-chat-manager .jc-small {
      font-size:12px;
      color:#aaaeb5;
      line-height:1.5;
    }
    #jarvis-chat-manager .jc-actions {
      display:flex;
      gap:8px;
      justify-content:flex-end;
      flex-wrap:wrap;
    }
    #jarvis-chat-manager button:disabled {
      opacity:.5;
      cursor:wait;
    }
    @media(max-width:700px) {
      #jarvis-chat-manager {
        grid-template-columns:1fr;
      }
      #jarvis-chat-manager .jc-list {
        max-height:125px;
      }
      #jarvis-chat-manager .jc-messages {
        height:340px;
      }
    }
  `;
  document.head.append(css);

  const root = node("div");
  root.id = "jarvis-chat-manager";

  const aside = node("div", "jc-side");
  const create = node("button", "btn primary", "+ Neuer Chat");
  create.type = "button";

  const search = node("input", "field");
  search.placeholder = "Chats suchen";
  search.setAttribute("aria-label", "Chats suchen");

  const list = node("div", "jc-list");
  const info = node(
    "div",
    "jc-small",
    "Chats werden nur auf diesem Gerät gespeichert. " +
    "Ein gemeinsames KI-Gedächtnis folgt später."
  );

  aside.append(create, search, list, info);

  const main = node("div", "jc-main");
  const header = node("div", "jc-head");
  const title = node("div", "jc-title");

  const rename = node("button", "btn quiet", "Umbenennen");
  const remove = node("button", "btn quiet", "Löschen");
  rename.type = "button";
  remove.type = "button";

  header.append(title, rename, remove);

  const messages = node("div", "jc-messages");
  messages.setAttribute("role", "log");
  messages.setAttribute("aria-live", "polite");

  const compose = node("div", "jc-compose");
  const input = node("textarea", "field");
  input.placeholder = "Schreib JARVIS eine Nachricht …";
  input.maxLength = 2000;

  const actions = node("div", "jc-actions");
  const status = node("span", "jc-small", "");
  status.style.flex = "1";

  const send = node("button", "btn primary", "Senden");
  send.type = "button";

  actions.append(status, send);
  compose.append(input, actions);
  main.append(header, messages, compose);
  root.append(aside, main);
  page.append(root);

  let chats = [];

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(saved)) {
      chats = saved
        .filter(c =>
          c &&
          typeof c.id === "string" &&
          typeof c.title === "string" &&
          Array.isArray(c.messages)
        )
        .slice(0, MAX_CHATS)
        .map(c => ({
          id: c.id,
          title: c.title.slice(0, 80),
          messages: c.messages
            .filter(m =>
              ["user", "assistant"].includes(m.role) &&
              typeof m.text === "string"
            )
            .slice(-MAX_MESSAGES)
            .map(m => ({
              role: m.role,
              text: m.text.slice(0, 8000)
            }))
        }));
    }
  } catch {}

  let active = chats[0]?.id || null;
  let busy = false;

  function store() {
    try {
      localStorage.setItem(KEY, JSON.stringify(chats));
      return true;
    } catch {
      status.textContent =
        "Speicher voll – Verlauf nicht gespeichert.";
      return false;
    }
  }

  const current = () => chats.find(c => c.id === active);

  function addChat() {
    if (chats.length >= MAX_CHATS) {
      alert("Maximal 40 lokale Chats.");
      return;
    }

    const chat = {
      id: uid(),
      title: "Neuer Chat",
      messages: []
    };

    chats.unshift(chat);
    active = chat.id;
    store();
    render();
    input.focus();
  }

  function render() {
    const chat = current();
    list.replaceChildren();

    const query = search.value.toLowerCase();

    for (const c of chats.filter(c =>
      c.title.toLowerCase().includes(query)
    )) {
      const button = node("button", "jc-chat", c.title);
      button.type = "button";

      button.setAttribute(
        "aria-current",
        String(c.id === active)
      );

      button.onclick = () => {
        if (busy) return;
        active = c.id;
        render();
      };

      list.append(button);
    }

    title.textContent = chat?.title || "Keine Gespräche";
    messages.replaceChildren();

    if (!chat || chat.messages.length === 0) {
      messages.append(
        node(
          "p",
          "jc-small",
          "Neues Gespräch. Schreibe deine erste Nachricht."
        )
      );
    } else {
      for (const m of chat.messages) {
        messages.append(
          node(
            "div",
            "jc-message " +
              (m.role === "user" ? "jc-user" : "jc-assistant"),
            m.text
          )
        );
      }
    }

    messages.scrollTop = messages.scrollHeight;
    send.disabled = busy || !chat;
    rename.disabled = busy || !chat;
    remove.disabled = busy || !chat;
  }

  create.onclick = () => {
    if (!busy) addChat();
  };

  search.oninput = render;

  rename.onclick = () => {
    const chat = current();
    if (!chat || busy) return;

    const name = prompt("Chat umbenennen:", chat.title);

    if (name && name.trim()) {
      chat.title = name.trim().slice(0, 80);
      store();
      render();
    }
  };

  remove.onclick = () => {
    const chat = current();
    if (!chat || busy) return;

    if (!confirm("Diesen Chat auf diesem Gerät löschen?")) {
      return;
    }

    chats = chats.filter(c => c.id !== chat.id);
    active = chats[0]?.id || null;
    store();
    render();
  };

  input.addEventListener("keydown", event => {
    if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey)
    ) {
      event.preventDefault();
      submit();
    }
  });

  send.onclick = submit;

  async function submit() {
    const chat = current();
    const message = input.value.trim();

    if (!chat || busy) return;

    if (message.length < 5 || message.length > 2000) {
      status.textContent = "Bitte 5–2000 Zeichen eingeben.";
      return;
    }

    const selected =
      document.querySelector('input[name="model"]:checked')
        ?.value || "llama";

    if (!["llama", "auto"].includes(selected)) {
      status.textContent =
        "Dieses Modell ist noch nicht freigeschaltet.";
      return;
    }

    busy = true;
    status.textContent = "JARVIS denkt …";

    chat.messages.push({
      role: "user",
      text: message
    });

    if (chat.title === "Neuer Chat") {
      chat.title = message.slice(0, 56);
    }

    chat.messages = chat.messages.slice(-MAX_MESSAGES);
    input.value = "";
    store();
    render();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          model: selected
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || `HTTP ${response.status}`
        );
      }

      if (typeof data.reply !== "string") {
        throw new Error("Keine gültige KI-Antwort");
      }

      chat.messages.push({
        role: "assistant",
        text: data.reply.slice(0, 8000)
      });

      chat.messages = chat.messages.slice(-MAX_MESSAGES);
      store();

      status.textContent = "Antwort lokal gespeichert.";
    } catch (error) {
      status.textContent =
        "KI-Anfrage fehlgeschlagen: " + error.message;
    } finally {
      busy = false;
      render();
    }
  }

  if (!active) {
    addChat();
  } else {
    render();
  }
})();
