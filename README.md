# Claude Chat Client

[![Tests](https://github.com/anshulbehl/claude-chat/actions/workflows/test.yml/badge.svg)](https://github.com/anshulbehl/claude-chat/actions/workflows/test.yml)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Claude](https://img.shields.io/badge/Claude-Anthropic-cc785c?logo=anthropic&logoColor=white)](https://www.anthropic.com/)
[![Vertex AI](https://img.shields.io/badge/Vertex%20AI-Google%20Cloud-4285F4?logo=googlecloud&logoColor=white)](https://cloud.google.com/vertex-ai)
[![License](https://img.shields.io/github/license/anshulbehl/claude-chat?color=blue)](LICENSE)

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

- **Chat Interface**: Clean, responsive web UI for Claude conversations
- **Model Selection**: Choose from 5 Claude models (Opus 4.6, Sonnet 4.6, and aliases)
- **File Uploads**: Support for images (.png, .jpg, .gif, .webp), PDFs, and text/code files
- **Research Mode**: Multi-query web search with intelligent topic breakdown and progress tracking
- **Streaming Responses**: Real-time streaming with markdown rendering and syntax highlighting
- **Stop Control**: Cancel streaming responses or research queries mid-execution
- **Dark/Light Theme**: Toggle between themes with smooth transitions
- **Session Management**: Persistent chat history with rename and delete capabilities
- **Modular Architecture**: Clean codebase with separated concerns for easy maintenance

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
