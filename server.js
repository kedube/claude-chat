import express from "express";
import { client, PORT } from "./lib/config.js";
import { probeModels, ALL_MODELS } from "./lib/models.js";
import { upload } from "./lib/file-processor.js";
import { setupModelsRoutes } from "./lib/routes/models.js";
import { setupSessionsRoutes } from "./lib/routes/sessions.js";
import { setupWorkspaceRoutes } from "./lib/routes/workspace.js";
import { setupChatRoute } from "./lib/routes/chat.js";

// Create Express app
const app = express();
app.use(express.json());
app.use(express.static("public"));

// Probe models on startup (async, non-blocking)
console.log("Probing model availability...");
const availableModels = await probeModels(client);

// Setup all API routes
setupModelsRoutes(app, availableModels);
setupSessionsRoutes(app);
setupWorkspaceRoutes(app);
setupChatRoute(app, client, upload);

// Start server
app.listen(PORT, () => {
  console.log(`Server running at: http://localhost:${PORT}`);
});

// Export for testing
export { app, ALL_MODELS };
