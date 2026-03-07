# Claude Chat Client

A lightweight web-based chat interface for Claude, powered by the Anthropic Vertex AI SDK. Provides a claude.ai-like experience with file upload support.

## Prerequisites

- Node.js 18+
- A Google Cloud project with the Vertex AI API enabled and Claude model access
- Google Cloud authentication configured:
  ```bash
  gcloud auth application-default login
  gcloud auth application-default set-quota-project YOUR_PROJECT_ID
  ```

## Setup

```bash
npm install
GOOGLE_CLOUD_PROJECT=your-project-id npm start
```

Then open http://localhost:3000 in your browser.

For development with auto-reload:

```bash
GOOGLE_CLOUD_PROJECT=your-project-id npm run dev
```

## Features

- Chat with Claude through a clean web UI
- Model selection (Opus, Sonnet, Haiku, and specific versions)
- File uploads: images (.png, .jpg, .gif, .webp), PDFs, and text/code files
- Streaming responses with markdown rendering and syntax highlighting
- Session history with persistence across restarts
- Cost tracking per message

## How It Works

The server uses the [Anthropic Vertex AI SDK](https://github.com/anthropics/anthropic-sdk-python) to call Claude models directly via Google Cloud's Vertex AI. Responses are streamed back to the browser via Server-Sent Events. Sessions are stored locally in `~/.claude-chat/data/`.

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLOUD_PROJECT` | *(required)* | Google Cloud project ID with Vertex AI access |
| `GOOGLE_CLOUD_REGION` | `us-east5` | Google Cloud region for Vertex AI |
| `PORT` | `3000` | Server port |

## Running Tests

```bash
npm test
```
