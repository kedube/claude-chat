# Claude Code Configuration for claude-chat-client

## Project Context

This is a browser-based chat client that connects to Claude via Anthropic's Vertex AI SDK. We are implementing Claude Code/Cowork features to transform it into a comprehensive AI workspace.

**Current Phase**: Phase 1 - Workspace Foundation & Research Mode
**Branch**: `dev/phase-1-workspace-foundation`
**Version**: `1.1.0-dev`

## Implementation Plan

See `/Users/anshul/.claude/plans/lovely-sparking-sutherland.md` for the complete plan.
See `IMPLEMENTATION_SESSION.md` for current session context.

## Auto-Approval Rules

**CRITICAL**: NEVER ask before making edits to files. Just make the changes directly. The user has configured auto-approval for all file operations.

### File Operations
- **Auto-approve**: Reading any file in this project
- **Auto-approve**: Editing ALL files in this project (no permission needed)
- **Auto-approve**: Creating new files in: `lib/`, `test/`, `public/`, root directory
- **Auto-approve**: Writing to any file in this project

### Git Operations
- **Auto-approve**: `git status`, `git diff`, `git log`, `git branch`
- **Auto-approve**: `git add` for any project files
- **Auto-approve**: `git commit` with descriptive messages
- **Auto-approve**: `git checkout` for branch switching
- **Require approval**: `git merge` for merging dev branches to main
- **Require approval**: `git push` (ALWAYS ask before pushing)

### Testing & Development
- **Auto-approve**: Running `npm test`, `npm run test:watch`
- **Auto-approve**: Running `npm start`, `npm run dev`
- **Auto-approve**: Installing npm packages with `npm install <package>`
- **Auto-approve**: Running `node` scripts for testing

### File System
- **Auto-approve**: Creating directories in project
- **Auto-approve**: Reading files from `~/.claude-chat/data/` (test data)
- **Auto-approve**: Listing files with `ls`, `find`, `tree`

## Development Guidelines

1. **Testing**: Run `npm test` after each feature completion
2. **Commits**: Make atomic commits with clear messages following conventional commits style
3. **Backward Compatibility**: Ensure old sessions still load correctly
4. **Code Quality**: Follow existing code style (ES6 modules, async/await)
5. **Documentation**: Update README.md and RELEASES.md when adding features
6. **Phase Transitions**: ALWAYS ask user permission before moving to next phase (e.g., 1.1 → 1.2) so they can test
7. **No Auto-Push**: NEVER push to git without explicit user approval

## Current Implementation Focus

### Phase 1.1: Enhanced Message Storage
- Modify session storage to preserve file references
- Create workspace directories per session
- Keep uploaded files instead of deleting
- Add workspace API endpoints

### Phase 1.2: Multi-Query Research Mode
- Detect research intent from user messages
- Break down into sub-queries
- Execute searches sequentially with progress updates

### Phase 1.3: Workspace File Tree UI
- File explorer sidebar
- File preview modal
- Folder upload support

## Project Structure

```
claude-chat-client/
├── server.js              # Express backend + Vertex AI integration
├── public/
│   ├── index.html        # UI layout and styles
│   └── app.js            # Client-side JavaScript
├── test/
│   └── api.test.js       # API tests with Vitest
├── lib/                  # To be created in Phase 2
│   └── workspace.js      # Workspace management utilities
├── package.json
├── README.md
├── RELEASES.md           # Release strategy and versions
├── IMPLEMENTATION_SESSION.md  # Current session context
└── CLAUDE.md             # This file
```

## Key Technologies

- **Backend**: Node.js, Express.js, Anthropic Vertex AI SDK
- **Frontend**: Vanilla JavaScript, marked.js, highlight.js
- **Testing**: Vitest, Supertest
- **Storage**: Local JSON files in `~/.claude-chat/data/`
- **Streaming**: Server-Sent Events (SSE)

## Environment Variables

```bash
GOOGLE_CLOUD_PROJECT=itpc-gcp-product-all-claude  # Required
GOOGLE_CLOUD_REGION=us-east5                      # Optional, defaults to us-east5
PORT=3000                                          # Optional, defaults to 3000
```

## Common Commands

```bash
# Development
npm run dev                                        # Start with auto-reload
GOOGLE_CLOUD_PROJECT=itpc-gcp-product-all-claude npm start

# Testing
npm test                                           # Run all tests
npm run test:watch                                 # Watch mode

# Git
git status
git add <files>
git commit -m "feat: description"
git push origin dev/phase-1-workspace-foundation

# Tagging releases
npm version minor                                  # Update package.json
git tag -a v1.1.0 -m "Release v1.1.0: Workspace Foundation"
git push origin main --tags
```

## Next Session: Start Here

1. Read `IMPLEMENTATION_SESSION.md` for current context
2. Continue Phase 1.1 implementation:
   - Modify `processUploadedFiles()` to save to workspace
   - Update message storage format
   - Add workspace API endpoints
   - Update tests
3. Run tests: `npm test`
4. Commit progress regularly

## Contact

Project owner: Anshul Behl
Repository: https://github.com/anshulbehl/claude-chat
