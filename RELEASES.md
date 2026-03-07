# Release Strategy

## Versioning Scheme

We follow [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`

- **MAJOR** (v2.0.0): Breaking changes, major architectural shifts
- **MINOR** (v1.1.0): New features, backward-compatible additions
- **PATCH** (v1.0.1): Bug fixes, minor improvements

## Development Workflow

1. **Development branches**: `dev/phase-N-feature-name`
2. **Feature completion**: Merge to `main` with PR
3. **Tag release**: Create git tag for version
4. **Push tag**: `git push origin v1.1.0`

## Planned Releases

### v1.0.0 (Current - March 7, 2026)
**Status**: Released ✅

**Features:**
- Basic chat with Anthropic Vertex AI
- File uploads (images, PDFs, text files)
- Web search integration
- Model selection (5 Claude models)
- Session persistence
- GitHub Actions CI

**Tag**: `v1.0.0`

---

### v1.1.0 (Phase 1 - Target: March 28, 2026)
**Status**: In Development 🚧

**Branch**: `dev/phase-1-workspace-foundation`

**Features:**
- Enhanced message storage with file metadata preservation
- Multi-query research mode with progress indicators
- Workspace file tree UI
- File persistence across sessions
- Folder upload support

**Success Criteria:**
- File uploads persist across reloads
- Research mode executes multiple queries
- File tree displays workspace structure
- All existing tests pass

**Tag**: `v1.1.0` (upon completion)

---

### v1.2.0 (Phase 2 - Target: April 25, 2026)
**Status**: Planned 📋

**Branch**: `dev/phase-2-file-editing`

**Features:**
- File editing tool with search/replace
- Real-time diff visualization
- Accept/reject edit controls
- Undo/redo system
- Batch edit support

**Tag**: `v1.2.0`

---

### v1.3.0 (Phase 3 - Target: June 6, 2026)
**Status**: Planned 📋

**Branch**: `dev/phase-3-advanced`

**Features:**
- Slash commands with autocomplete
- Sandboxed command execution
- Context management and windowing
- Command palette UI

**Tag**: `v1.3.0`

---

### v2.0.0 (Phase 4 - Target: TBD)
**Status**: Future 🔮

**Features:**
- Voice mode (speech-to-text, text-to-speech)
- MCP integration (plugin architecture)
- Multi-user collaboration
- Git UI integration

**Tag**: `v2.0.0`

---

## Release Process

### 1. Complete Development
```bash
# Work on dev branch
git checkout dev/phase-1-workspace-foundation
# ... make changes, commit regularly ...
git push origin dev/phase-1-workspace-foundation
```

### 2. Test Thoroughly
```bash
npm test                    # Run all tests
npm start                   # Manual testing
# Verify all success criteria from plan
```

### 3. Update Version
```bash
# Update package.json version
npm version minor           # For v1.1.0
# Or manually edit package.json
```

### 4. Merge to Main
```bash
git checkout main
git merge dev/phase-1-workspace-foundation --no-ff
git push origin main
```

### 5. Tag Release
```bash
git tag -a v1.1.0 -m "Release v1.1.0: Workspace Foundation & Research Mode

Features:
- Enhanced message storage with file metadata
- Multi-query research mode
- Workspace file tree UI
- File persistence across sessions

See RELEASES.md for full changelog"

git push origin v1.1.0
```

### 6. Document Release
Update this file with:
- Release date
- Actual features delivered
- Known issues or limitations
- Migration notes (if any)

---

## Hotfix Process

For critical bugs in production (main branch):

1. Create hotfix branch: `hotfix/v1.0.1-fix-description`
2. Fix bug, update tests
3. Update version to patch: `npm version patch`
4. Merge to main
5. Tag: `git tag v1.0.1`
6. Push: `git push origin main --tags`

---

## Rollback Strategy

If a release has critical issues:

1. Revert main to previous tag: `git revert <commit-range>`
2. Or reset to tag: `git reset --hard v1.0.0` (use with caution)
3. Notify users of rollback
4. Fix issues in dev branch before re-releasing

---

## Current Status

- **Main branch**: v1.0.0 (stable)
- **Development branch**: dev/phase-1-workspace-foundation (v1.1.0-dev)
- **Latest tag**: v1.0.0
- **Next release**: v1.1.0 (Phase 1 completion)
