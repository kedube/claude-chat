import express from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, copyFileSync, readdirSync, statSync, createReadStream } from "fs";
import { join, basename } from "path";
import { homedir } from "os";
import multer from "multer";
import AnthropicVertex from "@anthropic-ai/vertex-sdk";

const app = express();
const PORT = process.env.PORT || 3000;

// Vertex AI configuration
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_REGION = process.env.GOOGLE_CLOUD_REGION || "us-east5";

if (!GOOGLE_CLOUD_PROJECT) {
  console.error("Error: GOOGLE_CLOUD_PROJECT environment variable is required");
  console.error("Set it with: export GOOGLE_CLOUD_PROJECT=your-project-id");
  process.exit(1);
}

// Initialize Vertex AI client
const client = new AnthropicVertex({
  projectId: GOOGLE_CLOUD_PROJECT,
  region: GOOGLE_CLOUD_REGION,
});

// Session index storage
const DATA_DIR = join(homedir(), ".claude-chat", "data");
mkdirSync(DATA_DIR, { recursive: true });
const SESSIONS_FILE = join(DATA_DIR, "sessions.json");

// Upload directory for temporary file storage
const UPLOAD_DIR = join(homedir(), ".claude-chat", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

// Helper functions for workspace management
function getWorkspacePath(sessionId) {
  return join(DATA_DIR, sessionId, "workspace");
}

function ensureWorkspaceExists(sessionId) {
  const workspacePath = getWorkspacePath(sessionId);
  mkdirSync(workspacePath, { recursive: true });
  return workspacePath;
}

// Normalize message content for backward compatibility
// Old format: { role, content: "string" }
// New format: { role, content: [{ type: "text", text: "..." }, { type: "file_ref", ... }] }
function normalizeMessageContent(message) {
  // If content is already an array, it's new format
  if (Array.isArray(message.content)) {
    return message;
  }

  // Old format - convert to new format
  return {
    ...message,
    content: [{ type: "text", text: message.content }]
  };
}

// Supported file types
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const PDF_EXTENSIONS = [".pdf"];
const TEXT_EXTENSIONS = [
  ".txt", ".md", ".json", ".xml", ".html", ".htm", ".css", ".js", ".ts",
  ".jsx", ".tsx", ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".cs",
  ".rb", ".go", ".rs", ".php", ".swift", ".kt", ".scala", ".sh", ".bash",
  ".zsh", ".fish", ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
  ".log", ".csv", ".tsv", ".sql", ".r", ".m", ".pl", ".lua", ".vim",
  ".tex", ".rtf", ".diff", ".patch", ".gitignore", ".env", ".properties"
];

const ALLOWED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...PDF_EXTENSIONS, ...TEXT_EXTENSIONS];

// Configure multer for file uploads
const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB max
    files: 5 // Max 5 files per request
  },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (!ext || ext === file.originalname.toLowerCase()) {
      return cb(new Error(`File must have a valid extension`));
    }

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error(`File type "${ext}" is not supported. Allowed: images (.png, .jpg, .gif, .webp), PDFs (.pdf), and text files (.txt, .json, .md, code files, etc.)`));
    }

    cb(null, true);
  }
});

function loadSessions() {
  if (!existsSync(SESSIONS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// Helper to determine media type from file extension
function getMediaType(filename) {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  const mediaTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return mediaTypes[ext] || 'text/plain';
}

// Process uploaded files into Anthropic content format and save to workspace
// Returns { apiContent, fileReferences }
function processUploadedFiles(files, sessionId) {
  const apiContent = [];
  const fileReferences = [];

  if (!sessionId) {
    throw new Error("sessionId is required for processUploadedFiles");
  }

  // Ensure workspace directory exists
  const workspacePath = ensureWorkspaceExists(sessionId);

  for (const file of files) {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    const filename = basename(file.originalname);
    const workspaceFilePath = join(workspacePath, filename);

    // Copy file to workspace
    copyFileSync(file.path, workspaceFilePath);

    // Create file reference for storage
    const fileRef = {
      type: "file_ref",
      name: filename,
      path: join("workspace", filename), // Relative path from session directory
      size: file.size,
      mimeType: file.mimetype
    };
    fileReferences.push(fileRef);

    // Create API content based on file type
    if (IMAGE_EXTENSIONS.includes(ext)) {
      // Image files - use "image" type
      const fileData = readFileSync(file.path);
      const base64Data = fileData.toString('base64');
      const mediaType = getMediaType(file.originalname);

      apiContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64Data
        }
      });
    } else if (PDF_EXTENSIONS.includes(ext)) {
      // PDF files - use "document" type
      const fileData = readFileSync(file.path);
      const base64Data = fileData.toString('base64');

      apiContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64Data
        },
        cache_control: { type: "ephemeral" }
      });
    } else {
      // Text files - include as text
      const textContent = readFileSync(file.path, 'utf-8');
      apiContent.push({
        type: "text",
        text: `--- File: ${file.originalname} ---\n${textContent}\n--- End of ${file.originalname} ---`
      });
    }
  }

  return { apiContent, fileReferences };
}

// Research mode helper functions

// Detect if message is a research request (keyword-based)
function isResearchRequest(message) {
  const lowerMsg = message.toLowerCase();
  const researchKeywords = [
    "research", "investigate", "analyze", "compare", "explore",
    "find information about", "learn about", "tell me about",
    "what are the latest", "summarize", "overview of", "deep dive"
  ];
  return researchKeywords.some(keyword => lowerMsg.includes(keyword));
}

// Generate sub-queries for research mode
async function generateResearchQueries(topic, modelId) {
  const prompt = `You are a research assistant. Given a research topic, break it down into 3-5 focused search queries that would comprehensively cover the topic.

Research Topic: ${topic}

Return ONLY a JSON array of search query strings, nothing else. Example format:
["query 1", "query 2", "query 3"]

Queries should be:
- Specific and focused
- Cover different aspects of the topic
- Suitable for web search
- Ordered from general to specific`;

  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].text.trim();
    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const queries = JSON.parse(jsonMatch[0]);
      return Array.isArray(queries) ? queries.slice(0, 5) : [];
    }
    return [];
  } catch (err) {
    console.error("Failed to generate research queries:", err);
    return [];
  }
}

// Execute a single search query
async function executeSearch(query, modelId) {
  try {
    const stream = await client.messages.stream({
      model: modelId,
      max_tokens: 2048,
      messages: [{ role: "user", content: query }],
      tools: [{ name: "web_search", type: "web_search_20250305" }],
    });

    const finalMessage = await stream.finalMessage();

    // Extract search results
    const results = [];
    for (const block of finalMessage.content) {
      if (block.type === 'web_search_tool_result') {
        const searchResults = Array.isArray(block.content) ? block.content
          .filter(r => r.type === 'web_search_result')
          .map(r => ({ title: r.title, url: r.url, snippet: r.content || '' })) : [];
        results.push(...searchResults);
      }
    }

    // Extract text response
    const text = finalMessage.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return { results, text };
  } catch (err) {
    console.error(`Failed to execute search for query: ${query}`, err);
    return { results: [], text: '' };
  }
}

app.use(express.json());
app.use(express.static("public"));

// All known models - probed on startup to check availability
const ALL_MODELS = [
  { alias: "claude-opus-4-6", label: "Opus 4.6", description: "Latest, most intelligent", modelId: "claude-opus-4-6" },
  { alias: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Latest, fast and capable", modelId: "claude-sonnet-4-6" },
  { alias: "sonnet", label: "Sonnet 4.5", description: "Best for everyday tasks", modelId: "claude-sonnet-4-5@20250929" },
  { alias: "opus", label: "Opus 4.5", description: "Most capable for complex work", modelId: "claude-opus-4-5@20251101" },
  { alias: "haiku", label: "Haiku 4.5", description: "Fastest for quick answers", modelId: "claude-haiku-4-5@20251001" },
];

let availableModels = null;

async function probeModels() {
  console.log("Probing model availability...");
  const results = await Promise.allSettled(
    ALL_MODELS.map(async (m) => {
      try {
        await client.messages.create({
          model: m.modelId,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
        return m;
      } catch (err) {
        console.log(`  ${m.alias} (${m.modelId}): unavailable - ${err.message?.slice(0, 80)}`);
        return null;
      }
    })
  );
  availableModels = results
    .filter(r => r.status === "fulfilled" && r.value)
    .map(r => r.value);
  console.log(`Available models: ${availableModels.map(m => m.alias).join(", ")}`);
}

// Probe on startup (non-blocking)
probeModels();

// Get available models
app.get("/api/models", (_req, res) => {
  res.json(availableModels || ALL_MODELS);
});

// List all chat sessions
app.get("/api/sessions", (_req, res) => {
  const sessions = loadSessions();
  const list = Object.values(sessions).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
  res.json(list);
});

// Get a session's messages (with backward compatibility)
app.get("/api/sessions/:id/messages", (req, res) => {
  const sessions = loadSessions();
  const session = sessions[req.params.id];
  const messages = session?.messages || [];

  // Normalize all messages to new format
  const normalizedMessages = messages.map(normalizeMessageContent);

  res.json(normalizedMessages);
});

// Delete a session
app.delete("/api/sessions/:id", (req, res) => {
  const sessions = loadSessions();
  delete sessions[req.params.id];
  saveSessions(sessions);
  res.json({ ok: true });
});

// Chat endpoint - streams response via SSE
const handleUpload = (req, res, next) => {
  upload.array("files", 5)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

app.post("/api/chat", handleUpload, async (req, res) => {
  const { message, sessionId, model, research } = req.body;
  const uploadedFiles = req.files || [];

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");

  const sessions = loadSessions();
  let currentSessionId = sessionId;
  let isNewSession = !sessionId;

  // Generate session ID if new
  if (!currentSessionId) {
    currentSessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Cleanup function for uploaded files
  const cleanupFiles = () => {
    for (const file of uploadedFiles) {
      try {
        unlinkSync(file.path);
      } catch (err) {
        console.error(`Failed to delete ${file.path}:`, err);
      }
    }
  };

  try {
    // Get conversation history (normalize for backward compatibility)
    const existingMessages = sessions[currentSessionId]?.messages || [];
    const conversationHistory = existingMessages.map(msg => {
      const normalized = normalizeMessageContent(msg);
      // For API, we need to extract just text content (assistant messages are strings)
      // User messages with new format need to be converted back to API format
      if (normalized.role === "assistant") {
        return { role: "assistant", content: normalized.content[0].text };
      }
      // For user messages, reconstruct the content array (text only for history)
      const textParts = normalized.content.filter(c => c.type === "text");
      return {
        role: "user",
        content: textParts.map(c => ({ type: "text", text: c.text }))
      };
    });

    // Build user message content
    const userContent = [];
    let fileReferencesForStorage = [];

    // Add text message
    userContent.push({
      type: "text",
      text: message
    });

    // Add uploaded files
    if (uploadedFiles.length > 0) {
      const { apiContent, fileReferences } = processUploadedFiles(uploadedFiles, currentSessionId);
      userContent.push(...apiContent);
      fileReferencesForStorage = fileReferences;
    }

    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: userContent
    });

    // Send session ID
    res.write(`data: ${JSON.stringify({ type: "session", sessionId: currentSessionId })}\n\n`);

    // Get model ID
    const selectedModel = ALL_MODELS.find(m => m.alias === model) || ALL_MODELS[2];
    const modelId = selectedModel.modelId;

    console.log(`Calling Vertex AI with model: ${modelId}, messages: ${conversationHistory.length}, files: ${uploadedFiles.length}`);

    // Check if research mode is enabled (explicit button OR keyword detection)
    const explicitResearch = research === "true"; // From research button
    const implicitResearch = !explicitResearch && isResearchRequest(message); // From keywords
    const isResearch = explicitResearch || implicitResearch;
    let fullText = "";
    let allSources = [];
    let finalMessage = null;

    if (isResearch) {
      // Research mode: generate queries and execute sequentially
      res.write(`data: ${JSON.stringify({ type: "research_start" })}\n\n`);

      console.log(`Research mode activated for: ${message}`);

      // Generate sub-queries
      const queries = await generateResearchQueries(message, modelId);

      if (queries.length === 0) {
        // Fall back to normal mode if query generation fails
        res.write(`data: ${JSON.stringify({ type: "research_error", error: "Failed to generate research queries" })}\n\n`);
      } else {
        res.write(`data: ${JSON.stringify({ type: "research_queries", queries, total: queries.length })}\n\n`);

        // Execute each query sequentially
        const queryResults = [];
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          res.write(`data: ${JSON.stringify({ type: "research_query", query, index: i + 1, total: queries.length })}\n\n`);

          const { results, text } = await executeSearch(query, modelId);
          queryResults.push({ query, results, text });
          allSources.push(...results);

          res.write(`data: ${JSON.stringify({ type: "research_progress", completed: i + 1, total: queries.length })}\n\n`);
        }

        // Send all sources
        res.write(`data: ${JSON.stringify({ type: "research_sources", sources: allSources })}\n\n`);

        // Synthesize final response
        const synthesisPrompt = `Based on the following research findings, provide a comprehensive answer to: ${message}

Research Findings:
${queryResults.map((r, i) => `
Query ${i + 1}: ${r.query}
Findings: ${r.text}
Sources: ${r.results.map(s => `- ${s.title} (${s.url})`).join('\n')}
`).join('\n---\n')}

Provide a well-structured, comprehensive response that synthesizes these findings. Include citations where appropriate using [Source Title](URL) format.`;

        const synthesisStream = await client.messages.stream({
          model: modelId,
          max_tokens: 8192,
          messages: [{ role: "user", content: synthesisPrompt }],
        });

        synthesisStream.on('text', (text) => {
          fullText += text;
          res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
        });

        finalMessage = await synthesisStream.finalMessage();

        if (!fullText) {
          fullText = finalMessage.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('');
          res.write(`data: ${JSON.stringify({ type: "text", text: fullText })}\n\n`);
        }
      }
    } else {
      // Normal mode: single query with streaming
      const stream = await client.messages.stream({
        model: modelId,
        max_tokens: 8192,
        messages: conversationHistory,
        tools: [
          { name: "web_search", type: "web_search_20250305" },
        ],
        system: "You are Claude, a helpful AI assistant made by Anthropic. You are being accessed through a chat interface, similar to claude.ai. Have a natural conversation. Be helpful, harmless, and honest. Use markdown formatting when appropriate.",
      });

      // Handle streaming events
      stream.on('text', (text) => {
        fullText += text;
        res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
      });

      // Catch tool use events in real-time via raw stream events
      let activeToolIndex = -1;
      let toolInputJson = "";
      stream.on('streamEvent', (event) => {
        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'server_tool_use' && block.name === 'web_search') {
            activeToolIndex = event.index;
            toolInputJson = "";
            // Send immediate indicator (query will follow)
            res.write(`data: ${JSON.stringify({ type: "tool_use", name: "web_search" })}\n\n`);
          }
        } else if (event.type === 'content_block_delta' && event.index === activeToolIndex) {
          if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
            toolInputJson += event.delta.partial_json;
          }
        } else if (event.type === 'content_block_stop' && event.index === activeToolIndex) {
          // Send the complete query once we have it
          try {
            const input = JSON.parse(toolInputJson);
            if (input.query) {
              res.write(`data: ${JSON.stringify({ type: "tool_query", query: input.query })}\n\n`);
            }
          } catch {}
          activeToolIndex = -1;
        }
      });

      stream.on('error', (error) => {
        console.error('Stream error:', error);
        res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
      });

      // Wait for stream to complete
      finalMessage = await stream.finalMessage();

      // Extract search results from final message
      for (const block of finalMessage.content) {
        if (block.type === 'web_search_tool_result') {
          const results = Array.isArray(block.content) ? block.content
            .filter(r => r.type === 'web_search_result')
            .map(r => ({ title: r.title, url: r.url })) : [];
          res.write(`data: ${JSON.stringify({ type: "web_search_results", results })}\n\n`);
        }
      }

      // Extract text from response
      const assistantText = finalMessage.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('');

      if (!fullText) {
        fullText = assistantText;
        res.write(`data: ${JSON.stringify({ type: "text", text: fullText })}\n\n`);
      }
    }

    // Calculate cost (approximate)
    // For research mode, cost is estimated; for normal mode, it's from API response
    let totalCost = 0;
    if (isResearch) {
      // Rough estimate for research mode (multiple queries + synthesis)
      const estimatedTokens = fullText.length * 1.3; // Rough token estimate
      const MODEL_PRICING = {
        "claude-opus-4": { input: 15.0, output: 75.0 },
        "claude-sonnet-4": { input: 3.0, output: 15.0 },
        "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
        "claude-opus-4-5": { input: 15.0, output: 75.0 },
        "claude-haiku-4-5": { input: 0.8, output: 4.0 },
      };
      const modelFamily = modelId.split("@")[0];
      const costPerMillion = MODEL_PRICING[modelFamily] || { input: 3.0, output: 15.0 };
      totalCost = (estimatedTokens * costPerMillion.output) / 1000000;
    } else {
      // Normal mode - use actual usage from API
      const inputTokens = finalMessage.usage.input_tokens;
      const outputTokens = finalMessage.usage.output_tokens;
      const MODEL_PRICING = {
        "claude-opus-4": { input: 15.0, output: 75.0 },
        "claude-sonnet-4": { input: 3.0, output: 15.0 },
        "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
        "claude-opus-4-5": { input: 15.0, output: 75.0 },
        "claude-haiku-4-5": { input: 0.8, output: 4.0 },
      };
      const modelFamily = modelId.split("@")[0];
      const costPerMillion = MODEL_PRICING[modelFamily] || { input: 3.0, output: 15.0 };
      totalCost = (inputTokens * costPerMillion.input + outputTokens * costPerMillion.output) / 1000000;
    }

    res.write(`data: ${JSON.stringify({ type: "done", cost: totalCost, model: modelId })}\n\n`);

    // Update session index
    const reloadedSessions = loadSessions();
    const title = isNewSession && message
      ? message.slice(0, 80) + (message.length > 80 ? "..." : "")
      : reloadedSessions[currentSessionId]?.title || message.slice(0, 80);

    // Store messages locally with new structured format
    const existingMsgs = reloadedSessions[currentSessionId]?.messages || [];

    // Build user message content for storage
    const userMessageContent = [
      { type: "text", text: message }
    ];
    if (fileReferencesForStorage.length > 0) {
      userMessageContent.push(...fileReferencesForStorage);
    }

    existingMsgs.push(
      {
        role: "user",
        content: userMessageContent,
        timestamp: new Date().toISOString()
      },
      {
        role: "assistant",
        content: fullText,
        timestamp: new Date().toISOString()
      }
    );

    reloadedSessions[currentSessionId] = {
      id: currentSessionId,
      title,
      model: model || "sonnet",
      createdAt: reloadedSessions[currentSessionId]?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messageCount: existingMsgs.length,
      messages: existingMsgs,
    };
    saveSessions(reloadedSessions);

    res.write("data: [DONE]\n\n");
    res.end();

    // Cleanup temp files after successful response
    cleanupFiles();
  } catch (err) {
    console.error("Failed to call Vertex AI:", err);
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();

    // Cleanup temp files on error
    cleanupFiles();
  }
});

// Workspace API endpoints

// List all files in a session's workspace
app.get("/api/workspace/:sessionId/files", (req, res) => {
  const { sessionId } = req.params;
  const workspacePath = getWorkspacePath(sessionId);

  if (!existsSync(workspacePath)) {
    return res.json([]);
  }

  try {
    const files = readdirSync(workspacePath).map(filename => {
      const filePath = join(workspacePath, filename);
      const stats = statSync(filePath);
      return {
        name: filename,
        path: join("workspace", filename),
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    });
    res.json(files);
  } catch (err) {
    console.error("Failed to list workspace files:", err);
    res.status(500).json({ error: "Failed to list workspace files" });
  }
});

// Get a specific file from a session's workspace
app.get("/api/workspace/:sessionId/file", (req, res) => {
  const { sessionId } = req.params;
  const { path: relativePath } = req.query;

  if (!relativePath) {
    return res.status(400).json({ error: "path query parameter is required" });
  }

  // Security: ensure path is within workspace (prevent directory traversal)
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    return res.status(400).json({ error: "Invalid path" });
  }

  const workspacePath = getWorkspacePath(sessionId);
  const filePath = join(workspacePath, relativePath.replace(/^workspace\//, ""));

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  try {
    const stats = statSync(filePath);

    if (!stats.isFile()) {
      return res.status(400).json({ error: "Path is not a file" });
    }

    // Determine content type from extension
    const contentType = getMediaType(basename(filePath));

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", stats.size);
    res.setHeader("Content-Disposition", `inline; filename="${basename(filePath)}"`);

    // Stream file to response
    const stream = createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error("Failed to read workspace file:", err);
    res.status(500).json({ error: "Failed to read file" });
  }
});

// Export app for testing
export { app, ALL_MODELS, loadSessions, saveSessions, DATA_DIR, getWorkspacePath, normalizeMessageContent };

// Start server only when run directly
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Claude Chat Client running at http://localhost:${PORT}`);
    console.log(`Using Vertex AI in project: ${GOOGLE_CLOUD_PROJECT}, region: ${GOOGLE_CLOUD_REGION}`);
  });
}
