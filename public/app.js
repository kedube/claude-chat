// State
let currentSessionId = null;
let sessions = {};
let isStreaming = false;
let currentMessages = []; // local message history for display
let selectedFiles = []; // files to upload

// DOM elements
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const messagesEl = document.getElementById("messages");
const emptyState = document.getElementById("emptyState");
const sessionList = document.getElementById("sessionList");
const newChatBtn = document.getElementById("newChatBtn");
const modelSelect = document.getElementById("modelSelect");
const chatHeader = document.getElementById("chatHeader");
const modelBadge = document.getElementById("modelBadge");
const fileInput = document.getElementById("fileInput");
const attachBtn = document.getElementById("attachBtn");
const filesList = document.getElementById("filesList");

// Configure marked
marked.setOptions({
  highlight: function (code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

// Auto-resize textarea
chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + "px";
});

// Send on Enter (Shift+Enter for newline)
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);
newChatBtn.addEventListener("click", startNewChat);
modelSelect.addEventListener("change", () => {
  modelBadge.textContent = modelSelect.value;
});

// File upload handlers
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  selectedFiles.push(...files);
  renderFilesList();
  fileInput.value = ""; // Reset input
});

// Initialize
loadModels();
loadSessions();

function startNewChat() {
  currentSessionId = null;
  currentMessages = [];
  selectedFiles = [];
  renderMessages();
  renderFilesList();
  updateHeader("New Chat");
  highlightActiveSession();
  chatInput.focus();
}

function renderFilesList() {
  if (selectedFiles.length === 0) {
    filesList.style.display = "none";
    return;
  }

  filesList.style.display = "flex";
  filesList.innerHTML = selectedFiles
    .map((file, idx) => `
      <div class="file-tag">
        <span>${escapeHtml(file.name)}</span>
        <span class="remove" onclick="removeFile(${idx})">×</span>
      </div>
    `)
    .join("");
}

function removeFile(index) {
  selectedFiles.splice(index, 1);
  renderFilesList();
}

function updateHeader(title) {
  chatHeader.innerHTML = `
    <span>${escapeHtml(title)}</span>
    <span class="model-badge" id="modelBadge">${modelSelect.value}</span>
  `;
}

async function loadModels() {
  try {
    const res = await fetch("/api/models");
    const models = await res.json();
    const currentValue = modelSelect.value;
    modelSelect.innerHTML = models
      .map(
        (m) =>
          `<option value="${m.alias}" title="${m.modelId || m.alias}">${m.label} (${m.modelId || m.alias})</option>`
      )
      .join("");
    // Restore previous selection if still available
    if (models.some((m) => m.alias === currentValue)) {
      modelSelect.value = currentValue;
    }
    modelBadge.textContent = modelSelect.value;
    // Re-poll in 10s if models are still being probed (no modelId yet)
    if (models.some((m) => !m.modelId || m.modelId === m.alias)) {
      setTimeout(loadModels, 10000);
    }
  } catch (err) {
    console.error("Failed to load models:", err);
  }
}

async function loadSessions() {
  try {
    const res = await fetch("/api/sessions");
    const list = await res.json();
    sessions = {};
    list.forEach((s) => (sessions[s.id] = s));
    renderSessionList();
  } catch (err) {
    console.error("Failed to load sessions:", err);
  }
}

function renderSessionList() {
  const sorted = Object.values(sessions).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  sessionList.innerHTML = sorted
    .map(
      (s) => `
    <div class="session-item ${s.id === currentSessionId ? "active" : ""}"
         data-id="${s.id}" onclick="selectSession('${s.id}')">
      <div class="title">${escapeHtml(s.title || "Untitled")}</div>
      <div class="meta">${s.model || "sonnet"} -- ${timeAgo(s.updatedAt)}</div>
      <button class="delete-btn" onclick="event.stopPropagation(); deleteSession('${s.id}')" title="Delete">x</button>
    </div>
  `
    )
    .join("");
}

function highlightActiveSession() {
  document.querySelectorAll(".session-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === currentSessionId);
  });
}

async function selectSession(id) {
  currentSessionId = id;
  highlightActiveSession();
  const session = sessions[id];
  if (session) {
    updateHeader(session.title || "Chat");
    modelSelect.value = session.model || "sonnet";
  }

  // Load messages from server
  try {
    const res = await fetch(`/api/sessions/${id}/messages`);
    currentMessages = await res.json();
    renderMessages();
  } catch (err) {
    console.error("Failed to load messages:", err);
    currentMessages = [];
    renderMessages();
  }
}

async function deleteSession(id) {
  try {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    delete sessions[id];
    if (currentSessionId === id) {
      startNewChat();
    }
    renderSessionList();
  } catch (err) {
    console.error("Failed to delete session:", err);
  }
}

function renderMessages() {
  if (currentMessages.length === 0) {
    emptyState.style.display = "flex";
    messagesEl.innerHTML = "";
    messagesEl.appendChild(emptyState);
    return;
  }

  emptyState.style.display = "none";
  messagesEl.innerHTML = currentMessages
    .map(
      (m) => `
    <div class="message ${m.role}">
      <div class="role-label">${m.role === "user" ? "You" : "Claude"}</div>
      <div class="message-content">${m.role === "assistant" ? renderMarkdown(m.content) : escapeHtml(m.content)}</div>
    </div>
  `
    )
    .join("");

  addCopyButtons();
  scrollToBottom();
}

async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;

  isStreaming = true;
  sendBtn.disabled = true;
  chatInput.value = "";
  chatInput.style.height = "auto";

  // Add user message
  currentMessages.push({ role: "user", content: text });
  renderMessages();

  // Add streaming assistant message
  const assistantMsg = { role: "assistant", content: "" };
  currentMessages.push(assistantMsg);

  // Create streaming message element
  const msgEl = document.createElement("div");
  msgEl.className = "message assistant";
  msgEl.innerHTML = `
    <div class="role-label">Claude</div>
    <div class="message-content streaming-cursor">
      <div class="loading-dots"><span></span><span></span><span></span></div>
    </div>
  `;
  messagesEl.appendChild(msgEl);
  scrollToBottom();

  const contentEl = msgEl.querySelector(".message-content");

  try {
    // Build form data with files
    const formData = new FormData();
    formData.append("message", text);
    if (currentSessionId) {
      formData.append("sessionId", currentSessionId);
    }
    formData.append("model", modelSelect.value);

    // Add files
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      body: formData,
    });

    // Check for HTTP errors (like 400 Bad Request for invalid files)
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Upload failed";

      // Try to extract error message from HTML or JSON response
      if (errorText.includes("Only text files are allowed")) {
        const match = errorText.match(/Only text files are allowed[^<]*/);
        errorMessage = match ? match[0] : "Only text files are allowed. Images and binary files are not supported.";
      } else if (errorText.includes("error")) {
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorMessage;
        } catch {}
      }

      throw new Error(errorMessage);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let gotFirstText = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") continue;

        try {
          const event = JSON.parse(data);

          if (event.type === "session") {
            currentSessionId = event.sessionId;
          } else if (event.type === "text") {
            if (!gotFirstText) {
              contentEl.innerHTML = "";
              gotFirstText = true;
            }
            fullText += event.text;
            contentEl.innerHTML = renderMarkdown(fullText);
            contentEl.classList.add("streaming-cursor");
            scrollToBottom();
          } else if (event.type === "done") {
            contentEl.classList.remove("streaming-cursor");
            if (event.cost) {
              const costEl = document.createElement("div");
              costEl.className = "cost-info";
              costEl.textContent = `$${event.cost.toFixed(4)}`;
              msgEl.appendChild(costEl);
            }
          } else if (event.type === "error") {
            contentEl.classList.remove("streaming-cursor");
            contentEl.innerHTML = `<p style="color: var(--accent)">Error: ${escapeHtml(event.error)}</p>`;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    assistantMsg.content = fullText;
    addCopyButtons();

    // Clear uploaded files
    selectedFiles = [];
    renderFilesList();

    // Refresh session list
    await loadSessions();
    highlightActiveSession();

    // Update header for new chats
    if (sessions[currentSessionId]) {
      updateHeader(sessions[currentSessionId].title || "Chat");
    }
  } catch (err) {
    contentEl.classList.remove("streaming-cursor");
    contentEl.innerHTML = `<p style="color: var(--accent)">Error: ${escapeHtml(err.message)}</p>`;

    // Remove the failed assistant message
    currentMessages.pop();

    // Clear files on error
    selectedFiles = [];
    renderFilesList();
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    chatInput.focus();
  }
}

function renderMarkdown(text) {
  try {
    return marked.parse(text);
  } catch {
    return escapeHtml(text);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function addCopyButtons() {
  document.querySelectorAll("pre code").forEach((block) => {
    if (block.parentElement.querySelector(".copy-btn")) return;
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(block.textContent);
      btn.textContent = "Copied!";
      setTimeout(() => (btn.textContent = "Copy"), 1500);
    });
    block.parentElement.style.position = "relative";
    block.parentElement.appendChild(btn);
  });
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function timeAgo(dateStr) {
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return Math.floor(seconds / 60) + "m ago";
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h ago";
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d ago";
  return new Date(dateStr).toLocaleDateString();
}
