import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import AnthropicVertex from "@anthropic-ai/vertex-sdk";

// Server configuration
export const PORT = process.env.PORT || 3000;

// Vertex AI configuration
export const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
export const GOOGLE_CLOUD_REGION = process.env.GOOGLE_CLOUD_REGION || "us-east5";

if (!GOOGLE_CLOUD_PROJECT) {
  console.error("Error: GOOGLE_CLOUD_PROJECT environment variable is required");
  console.error("Set it with: export GOOGLE_CLOUD_PROJECT=your-project-id");
  process.exit(1);
}

// Initialize Vertex AI client
export const client = new AnthropicVertex({
  projectId: GOOGLE_CLOUD_PROJECT,
  region: GOOGLE_CLOUD_REGION,
});

// Directory paths
export const DATA_DIR = join(homedir(), ".claude-chat", "data");
mkdirSync(DATA_DIR, { recursive: true });

export const UPLOAD_DIR = join(homedir(), ".claude-chat", "uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

export const SESSIONS_FILE = join(DATA_DIR, "sessions.json");
