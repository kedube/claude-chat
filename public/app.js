// State
let currentSessionId = null;
let sessions = {};
let isStreaming = false;
let currentStreamId = null; // track active stream for stopping
let currentMessages = []; // local message history for display
let selectedFiles = []; // files to upload
let researchMode = false; // research mode toggle
let currentTheme = localStorage.getItem('theme') || 'dark'; // theme preference
let sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true'; // sidebar state

// DOM elements
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const messagesEl = document.getElementById("messages");
const emptyState = document.getElementById("emptyState");
const sessionList = document.getElementById("sessionList");
const newChatBtn = document.getElementById("newChatBtn");
const modelSelect = document.getElementById("modelSelect");
const chatHeader = document.getElementById("chatHeader");
const modelBadge = document.getElementById("modelBadge");
const fileInput = document.getElementById("fileInput");
const attachBtn = document.getElementById("attachBtn");
const researchBtn = document.getElementById("researchBtn");
const filesList = document.getElementById("filesList");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const themeLabel = document.getElementById("themeLabel");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebarToggle");

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
stopBtn.addEventListener("click", stopStream);
newChatBtn.addEventListener("click", startNewChat);
modelSelect.addEventListener("change", () => {
  modelBadge.textContent = modelSelect.value;
});

// File upload handlers
attachBtn.addEventListener("click", () => fileInput.click());

// Research mode toggle
researchBtn.addEventListener("click", () => {
  researchMode = !researchMode;
  researchBtn.classList.toggle("active", researchMode);

  // Update placeholder
  if (researchMode) {
    chatInput.placeholder = "Enter research topic (will generate 3-5 sub-queries)...";
  } else {
    chatInput.placeholder = "Message Claude...";
  }
});
fileInput.addEventListener("change", (e) => {
  const files = Array.from(e.target.files);
  selectedFiles.push(...files);
  renderFilesList();
  fileInput.value = ""; // Reset input
});

// Theme toggle
themeToggle.addEventListener("click", () => {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(currentTheme);
  localStorage.setItem('theme', currentTheme);
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // Show the opposite mode (the one we can switch TO)
  if (theme === 'light') {
    // Currently light, show moon icon to switch to dark
    themeIcon.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
    themeLabel.textContent = 'Dark Mode';
  } else {
    // Currently dark, show sun icon to switch to light
    themeIcon.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
    themeLabel.textContent = 'Light Mode';
  }
}

// Sidebar toggle
sidebarToggle.addEventListener("click", () => {
  sidebarCollapsed = !sidebarCollapsed;
  sidebar.classList.toggle('collapsed', sidebarCollapsed);
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
});

function initializeSidebar() {
  if (sidebarCollapsed) {
    sidebar.classList.add('collapsed');
  }
}

async function stopStream() {
  if (!currentStreamId) return;

  try {
    await fetch("/api/chat/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ streamId: currentStreamId }),
    });

    // Show stopped message
    const msgEl = messagesEl.querySelector(".message.assistant:last-child");
    const contentEl = msgEl?.querySelector(".message-content");
    if (contentEl) {
      contentEl.classList.remove("streaming-cursor");

      // Check if this is research mode (has research-mode div)
      const researchMode = contentEl.querySelector(".research-mode");
      if (researchMode) {
        // Research mode: Add stopped notice to the research UI
        const stoppedNotice = document.createElement("div");
        stoppedNotice.className = "research-status";
        stoppedNotice.style.color = "var(--accent)";
        stoppedNotice.style.fontStyle = "italic";
        stoppedNotice.style.marginTop = "12px";
        stoppedNotice.textContent = "Research stopped by user";
        researchMode.appendChild(stoppedNotice);
      } else {
        // Normal mode: Append stopped message to text
        const currentContent = contentEl.textContent || "";
        contentEl.innerHTML = renderMarkdown(currentContent + "\n\n*Response stopped by user*");
      }
    }
  } catch (err) {
    console.error("Failed to stop stream:", err);
  }
}

// Initialize
applyTheme(currentTheme);
initializeSidebar();
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
      (m) => {
        // Extract text content from message
        let textContent = "";

        // Both user and assistant messages can be array or string after normalization
        if (Array.isArray(m.content)) {
          // New format: extract text from content blocks
          const textParts = m.content
            .filter(block => block.type === "text")
            .map(block => block.text);
          const rawText = textParts.join("\n");
          textContent = m.role === "assistant" ? renderMarkdown(rawText) : escapeHtml(rawText);
        } else {
          // Old format: content is a string (backward compatibility)
          textContent = m.role === "assistant" ? renderMarkdown(m.content) : escapeHtml(m.content);
        }

        return `
    <div class="message ${m.role}">
      <div class="role-label">${m.role === "user" ? "You" : "Claude"}</div>
      <div class="message-content">${textContent}</div>
    </div>
  `;
      }
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
  sendBtn.style.display = "none";
  stopBtn.classList.add("visible");
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
    formData.append("research", researchMode ? "true" : "false");

    // Add files
    for (const file of selectedFiles) {
      formData.append("files", file);
    }

    // Reset research mode after sending
    if (researchMode) {
      researchMode = false;
      researchBtn.classList.remove("active");
      chatInput.placeholder = "Message Claude...";
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
            currentStreamId = event.streamId;
          } else if (event.type === "research_start") {
            // Research mode activated
            if (!gotFirstText) {
              contentEl.innerHTML = "";
              gotFirstText = true;
            }
            contentEl.innerHTML = `
              <div class="research-mode">
                <div class="research-header">
                  <span class="research-icon">🔍</span>
                  <strong>Research Mode Activated</strong>
                </div>
                <div class="research-status">Generating research queries...</div>
              </div>
            `;
            scrollToBottom();
          } else if (event.type === "research_queries") {
            // Show the queries that will be executed
            const queriesHtml = event.queries.map((q, i) => `
              <div class="research-query-item" data-index="${i}">
                <span class="query-number">${i + 1}</span>
                <span class="query-text">${escapeHtml(q)}</span>
                <span class="query-status pending"></span>
              </div>
            `).join('');
            contentEl.innerHTML = `
              <div class="research-mode">
                <div class="research-header">
                  <span class="research-icon">🔍</span>
                  <strong>Research Plan</strong>
                </div>
                <div class="research-queries">
                  ${queriesHtml}
                </div>
                <div class="research-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%"></div>
                  </div>
                  <div class="progress-text">0 / ${event.total} queries completed</div>
                </div>
              </div>
            `;
            msgEl._totalQueries = event.total;
            scrollToBottom();
          } else if (event.type === "research_query") {
            // Mark current query as in progress with animated spinner
            const queryItems = contentEl.querySelectorAll(".research-query-item");
            if (queryItems[event.index - 1]) {
              queryItems[event.index - 1].querySelector(".query-status").innerHTML = '<div class="query-spinner"></div>';
              queryItems[event.index - 1].classList.add("active");
            }
            scrollToBottom();
          } else if (event.type === "research_progress") {
            // Update progress
            const progressFill = contentEl.querySelector(".progress-fill");
            const progressText = contentEl.querySelector(".progress-text");
            const percentage = (event.completed / event.total) * 100;
            if (progressFill) progressFill.style.width = percentage + "%";
            if (progressText) progressText.textContent = `${event.completed} / ${event.total} queries completed`;

            // Mark completed queries with checkmark (stop spinner)
            const queryItems = contentEl.querySelectorAll(".research-query-item");
            if (queryItems[event.completed - 1]) {
              queryItems[event.completed - 1].querySelector(".query-status").innerHTML = '<span class="query-checkmark">✓</span>';
              queryItems[event.completed - 1].classList.remove("active");
              queryItems[event.completed - 1].classList.add("completed");
            }
            scrollToBottom();
          } else if (event.type === "research_sources") {
            // Store sources for later display
            msgEl._researchSources = event.sources;
          } else if (event.type === "text") {
            if (!gotFirstText) {
              contentEl.innerHTML = "";
              gotFirstText = true;
            }
            fullText += event.text;
            contentEl.innerHTML = renderMarkdown(fullText);
            contentEl.classList.add("streaming-cursor");
            scrollToBottom();
          } else if (event.type === "tool_use" && event.name === "web_search") {
            // Show search indicator immediately
            if (!gotFirstText) {
              contentEl.innerHTML = "";
              gotFirstText = true;
            }
            contentEl.innerHTML = `<div class="search-indicator"><span class="search-spinner"></span> Searching the web...</div>`;
            scrollToBottom();
          } else if (event.type === "tool_query") {
            // Update indicator with the actual query
            contentEl.innerHTML = `<div class="search-indicator"><span class="search-spinner"></span> Searching for: ${escapeHtml(event.query)}</div>`;
            scrollToBottom();
          } else if (event.type === "web_search_results" && event.results?.length > 0) {
            // Store search results to append after text
            msgEl._searchResults = event.results;
          } else if (event.type === "done") {
            contentEl.classList.remove("streaming-cursor");

            // Append research sources if any (from research mode)
            if (msgEl._researchSources?.length > 0) {
              const sourcesEl = document.createElement("div");
              sourcesEl.className = "search-sources research-sources-list";
              sourcesEl.innerHTML = `<details open><summary>Research Sources (${msgEl._researchSources.length})</summary><ul>${
                msgEl._researchSources.map(r => `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a></li>`).join("")
              }</ul></details>`;
              msgEl.appendChild(sourcesEl);
            }
            // Append web search sources if any (from normal search)
            else if (msgEl._searchResults?.length > 0) {
              const sourcesEl = document.createElement("div");
              sourcesEl.className = "search-sources";
              sourcesEl.innerHTML = `<details><summary>Sources (${msgEl._searchResults.length})</summary><ul>${
                msgEl._searchResults.map(r => `<li><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a></li>`).join("")
              }</ul></details>`;
              msgEl.appendChild(sourcesEl);
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
    sendBtn.style.display = "flex";
    stopBtn.classList.remove("visible");
    currentStreamId = null;
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
