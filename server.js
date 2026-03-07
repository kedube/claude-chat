import express from "express";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { join } from "path";
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

// Process uploaded files into Anthropic content format
function processUploadedFiles(files) {
  const content = [];

  for (const file of files) {
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

    if (IMAGE_EXTENSIONS.includes(ext)) {
      // Image files - use "image" type
      const fileData = readFileSync(file.path);
      const base64Data = fileData.toString('base64');
      const mediaType = getMediaType(file.originalname);

      content.push({
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

      content.push({
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
      content.push({
        type: "text",
        text: `--- File: ${file.originalname} ---\n${textContent}\n--- End of ${file.originalname} ---`
      });
    }
  }

  return content;
}

app.use(express.json());
app.use(express.static("public"));

// Available models
const MODELS = [
  { alias: "claude-opus-4-6", label: "Opus 4.6", description: "Latest, most intelligent", modelId: "claude-opus-4@20250514" },
  { alias: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Latest, fast and capable", modelId: "claude-sonnet-4@20250514" },
  { alias: "sonnet", label: "Sonnet 4.5", description: "Best for everyday tasks", modelId: "claude-sonnet-4-5@20250929" },
  { alias: "opus", label: "Opus 4.5", description: "Most capable for complex work", modelId: "claude-opus-4-5@20251101" },
  { alias: "haiku", label: "Haiku 4.5", description: "Fastest for quick answers", modelId: "claude-haiku-4-5@20251022" },
];

// Get available models
app.get("/api/models", (_req, res) => {
  res.json(MODELS);
});

// List all chat sessions
app.get("/api/sessions", (_req, res) => {
  const sessions = loadSessions();
  const list = Object.values(sessions).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
  res.json(list);
});

// Get a session's messages
app.get("/api/sessions/:id/messages", (req, res) => {
  const sessions = loadSessions();
  const session = sessions[req.params.id];
  res.json(session?.messages || []);
});

// Delete a session
app.delete("/api/sessions/:id", (req, res) => {
  const sessions = loadSessions();
  delete sessions[req.params.id];
  saveSessions(sessions);
  res.json({ ok: true });
});

// Chat endpoint - streams response via SSE
app.post("/api/chat", upload.array("files", 5), async (req, res) => {
  const { message, sessionId, model } = req.body;
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

  res.on("close", cleanupFiles);

  try {
    // Get conversation history
    const existingMessages = sessions[currentSessionId]?.messages || [];
    const conversationHistory = existingMessages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Build user message content
    const userContent = [];

    // Add text message
    userContent.push({
      type: "text",
      text: message
    });

    // Add uploaded files
    if (uploadedFiles.length > 0) {
      const fileContent = processUploadedFiles(uploadedFiles);
      userContent.push(...fileContent);
    }

    // Add user message to history
    conversationHistory.push({
      role: "user",
      content: userContent
    });

    // Send session ID
    res.write(`data: ${JSON.stringify({ type: "session", sessionId: currentSessionId })}\n\n`);

    // Get model ID
    const selectedModel = MODELS.find(m => m.alias === model) || MODELS[2];
    const modelId = selectedModel.modelId;

    console.log(`Calling Vertex AI with model: ${modelId}, messages: ${conversationHistory.length}, files: ${uploadedFiles.length}`);

    // Call Anthropic Vertex AI with streaming
    let fullText = "";

    const stream = await client.messages.stream({
      model: modelId,
      max_tokens: 8192,
      messages: conversationHistory,
      system: "You are Claude, a helpful AI assistant made by Anthropic. You are being accessed through a chat interface, similar to claude.ai. Have a natural conversation. Be helpful, harmless, and honest. Use markdown formatting when appropriate.",
    });

    // Handle streaming events
    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`);
    });

    // Wait for stream to complete
    const finalMessage = await stream.finalMessage();

    // Extract text from response
    const assistantText = finalMessage.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    if (!fullText) {
      fullText = assistantText;
      res.write(`data: ${JSON.stringify({ type: "text", text: fullText })}\n\n`);
    }

    // Calculate cost (approximate)
    const inputTokens = finalMessage.usage.input_tokens;
    const outputTokens = finalMessage.usage.output_tokens;
    const costPerMillion = { input: 3.0, output: 15.0 }; // Opus pricing
    const totalCost = (inputTokens * costPerMillion.input + outputTokens * costPerMillion.output) / 1000000;

    res.write(`data: ${JSON.stringify({ type: "done", cost: totalCost, model: modelId })}\n\n`);

    // Update session index
    const reloadedSessions = loadSessions();
    const title = isNewSession && message
      ? message.slice(0, 80) + (message.length > 80 ? "..." : "")
      : reloadedSessions[currentSessionId]?.title || message.slice(0, 80);

    // Store messages locally
    const existingMsgs = reloadedSessions[currentSessionId]?.messages || [];
    existingMsgs.push(
      { role: "user", content: message + (uploadedFiles.length > 0 ? ` [+${uploadedFiles.length} file(s)]` : '') },
      { role: "assistant", content: fullText }
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
  } catch (err) {
    console.error("Failed to call Vertex AI:", err);
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } finally {
    cleanupFiles();
  }
});

app.listen(PORT, () => {
  console.log(`Claude Chat Client running at http://localhost:${PORT}`);
  console.log(`Using Vertex AI in project: ${GOOGLE_CLOUD_PROJECT}, region: ${GOOGLE_CLOUD_REGION}`);
});
