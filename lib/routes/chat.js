import { unlinkSync } from "fs";
import { loadSessions, saveSessions } from "../sessions.js";
import { normalizeMessageContent } from "../messages.js";
import { processUploadedFiles } from "../file-processor.js";
import { isResearchRequest, generateResearchQueries, executeSearch } from "../research.js";
import { ALL_MODELS } from "../models.js";

// Track active streaming connections
const activeStreams = new Map();

/**
 * Setup chat API route
 * @param {Object} app - Express app instance
 * @param {Object} client - Anthropic Vertex AI client
 * @param {Object} upload - Multer upload middleware
 */
export function setupChatRoute(app, client, upload) {
  // Upload handler middleware
  const handleUpload = (req, res, next) => {
    upload.array("files", 5)(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  };

  /**
   * POST /api/chat
   * Main chat endpoint - handles streaming responses with SSE
   */
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

  // Generate unique stream ID and track it
  const streamId = `${currentSessionId}-${Date.now()}`;
  const streamControl = { stopped: false };
  activeStreams.set(streamId, streamControl);

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

    // Send session ID and stream ID
    res.write(`data: ${JSON.stringify({ type: "session", sessionId: currentSessionId, streamId })}\n\n`);

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
      const queries = await generateResearchQueries(message, modelId, client);

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

          const { results, text } = await executeSearch(query, modelId, client);
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
          if (streamControl.stopped) return;
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
        if (streamControl.stopped) return;
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

    res.write(`data: ${JSON.stringify({ type: "done", model: modelId })}\n\n`);

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
  } finally {
    // Clean up active stream tracking
    activeStreams.delete(streamId);
  }
});

  /**
   * POST /api/chat/stop
   * Stop an active streaming response
   */
  app.post("/api/chat/stop", (req, res) => {
    const { streamId } = req.body;

    if (!streamId) {
      return res.status(400).json({ error: "streamId is required" });
    }

    const streamControl = activeStreams.get(streamId);
    if (streamControl) {
      streamControl.stopped = true;
      return res.json({ ok: true });
    }

    // Stream already finished or doesn't exist
    return res.json({ ok: true, message: "Stream already completed" });
  });
}
