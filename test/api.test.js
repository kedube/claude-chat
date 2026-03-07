import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import request from "supertest";

// Set env before importing server
process.env.GOOGLE_CLOUD_PROJECT = "test-project";
process.env.GOOGLE_CLOUD_REGION = "us-east5";

// Mock the Vertex AI SDK
const mockStream = {
  on: vi.fn(),
  finalMessage: vi.fn(),
};

vi.mock("@anthropic-ai/vertex-sdk", () => {
  return {
    default: class MockAnthropicVertex {
      constructor() {
        this.messages = {
          stream: vi.fn().mockResolvedValue(mockStream),
          create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
        };
      }
    },
  };
});

// Use a temp directory for session data so tests don't affect real data
const TEST_DATA_DIR = join(tmpdir(), "claude-chat-test-" + Date.now());

vi.mock("os", async () => {
  const actual = await vi.importActual("os");
  return {
    ...actual,
    homedir: () => TEST_DATA_DIR,
  };
});

let app, MODELS;

beforeAll(async () => {
  mkdirSync(join(TEST_DATA_DIR, ".claude-chat", "data"), { recursive: true });
  mkdirSync(join(TEST_DATA_DIR, ".claude-chat", "uploads"), { recursive: true });
  const mod = await import("../server.js");
  app = mod.app;
  MODELS = mod.ALL_MODELS;
  // Wait for model probing to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});

afterEach(() => {
  const sessionsFile = join(TEST_DATA_DIR, ".claude-chat", "data", "sessions.json");
  if (existsSync(sessionsFile)) {
    rmSync(sessionsFile);
  }
});

function writeTestSessions(sessions) {
  const sessionsFile = join(TEST_DATA_DIR, ".claude-chat", "data", "sessions.json");
  writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
}

describe("GET /api/models", () => {
  it("returns array of models with required fields", async () => {
    const res = await request(app).get("/api/models");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);

    for (const model of res.body) {
      expect(model).toHaveProperty("alias");
      expect(model).toHaveProperty("label");
      expect(model).toHaveProperty("modelId");
    }
  });

  it("includes haiku, sonnet, and opus", async () => {
    const res = await request(app).get("/api/models");
    const aliases = res.body.map((m) => m.alias);
    expect(aliases).toContain("haiku");
    expect(aliases).toContain("sonnet");
    expect(aliases).toContain("opus");
  });
});

describe("GET /api/sessions", () => {
  it("returns empty array when no sessions exist", async () => {
    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns sessions sorted by updatedAt descending", async () => {
    writeTestSessions({
      old: {
        id: "old",
        title: "Old Chat",
        model: "sonnet",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        messageCount: 2,
        messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }],
      },
      newer: {
        id: "newer",
        title: "Newer Chat",
        model: "sonnet",
        createdAt: "2026-03-01T00:00:00Z",
        updatedAt: "2026-03-01T00:00:00Z",
        messageCount: 2,
        messages: [{ role: "user", content: "test" }, { role: "assistant", content: "ok" }],
      },
    });

    const res = await request(app).get("/api/sessions");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].id).toBe("newer");
    expect(res.body[1].id).toBe("old");
  });
});

describe("GET /api/sessions/:id/messages", () => {
  it("returns empty array for non-existent session", async () => {
    const res = await request(app).get("/api/sessions/nonexistent/messages");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns messages for existing session with new format", async () => {
    const messages = [
      { role: "user", content: [{ type: "text", text: "hello" }] },
      { role: "assistant", content: [{ type: "text", text: "hi there" }] },
    ];
    writeTestSessions({
      sess1: {
        id: "sess1",
        title: "Test",
        messages,
      },
    });

    const res = await request(app).get("/api/sessions/sess1/messages");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(messages);
  });

  it("normalizes old format messages to new format", async () => {
    // Old format with plain string content
    const oldMessages = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ];
    writeTestSessions({
      sess1: {
        id: "sess1",
        title: "Old Session",
        messages: oldMessages,
      },
    });

    const res = await request(app).get("/api/sessions/sess1/messages");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // Should be normalized to new format
    expect(res.body[0].content).toEqual([{ type: "text", text: "hello" }]);
    expect(res.body[1].content).toEqual([{ type: "text", text: "hi there" }]);
  });
});

describe("DELETE /api/sessions/:id", () => {
  it("deletes a session and returns ok", async () => {
    writeTestSessions({
      sess1: { id: "sess1", title: "To delete", messages: [] },
      sess2: { id: "sess2", title: "Keep", messages: [] },
    });

    const res = await request(app).delete("/api/sessions/sess1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    // Verify it's gone
    const listRes = await request(app).get("/api/sessions");
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].id).toBe("sess2");
  });
});

describe("POST /api/chat", () => {
  it("returns 400 when message is missing", async () => {
    const res = await request(app).post("/api/chat").field("model", "sonnet");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("message is required");
  });

  it("returns 400 for unsupported file types", async () => {
    const res = await request(app)
      .post("/api/chat")
      .field("message", "test")
      .field("model", "sonnet")
      .attach("files", Buffer.from("binary"), "malware.exe");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("not supported");
  });

  it("streams SSE response for valid text message", async () => {
    // Set up mock stream behavior
    mockStream.on.mockImplementation((event, handler) => {
      if (event === "text") {
        setTimeout(() => handler("Hello "), 10);
        setTimeout(() => handler("world"), 20);
      }
      return mockStream;
    });
    mockStream.finalMessage.mockResolvedValue({
      content: [{ type: "text", text: "Hello world" }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const res = await request(app)
      .post("/api/chat")
      .field("message", "Say hello")
      .field("model", "sonnet");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("text/event-stream");

    // Parse SSE events
    const events = res.text
      .split("\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
      .map((l) => {
        try { return JSON.parse(l.slice(6)); } catch { return null; }
      })
      .filter(Boolean);

    // Should have session event
    const sessionEvent = events.find((e) => e.type === "session");
    expect(sessionEvent).toBeTruthy();
    expect(sessionEvent.sessionId).toBeTruthy();

    // Should have done event
    const doneEvent = events.find((e) => e.type === "done");
    expect(doneEvent).toBeTruthy();
  });

  it("creates a new session for first message", async () => {
    mockStream.on.mockImplementation(() => mockStream);
    mockStream.finalMessage.mockResolvedValue({
      content: [{ type: "text", text: "Hi" }],
      usage: { input_tokens: 5, output_tokens: 2 },
    });

    await request(app)
      .post("/api/chat")
      .field("message", "First message")
      .field("model", "sonnet");

    // Check session was created
    const listRes = await request(app).get("/api/sessions");
    expect(listRes.body.length).toBeGreaterThan(0);
    const session = listRes.body[0];
    expect(session.title).toBe("First message");
    expect(session.model).toBe("sonnet");
  });

  it("accepts text file uploads", async () => {
    mockStream.on.mockImplementation(() => mockStream);
    mockStream.finalMessage.mockResolvedValue({
      content: [{ type: "text", text: "File received" }],
      usage: { input_tokens: 20, output_tokens: 5 },
    });

    const res = await request(app)
      .post("/api/chat")
      .field("message", "What is in this file?")
      .field("model", "sonnet")
      .attach("files", Buffer.from("hello world"), "test.txt");

    expect(res.status).toBe(200);

    // Parse SSE events to verify session was created
    const events = res.text
      .split("\n")
      .filter((l) => l.startsWith("data: ") && l !== "data: [DONE]")
      .map((l) => {
        try { return JSON.parse(l.slice(6)); } catch { return null; }
      })
      .filter(Boolean);

    const sessionEvent = events.find((e) => e.type === "session");
    expect(sessionEvent).toBeTruthy();
    expect(sessionEvent.sessionId).toBeTruthy();
  });
});

