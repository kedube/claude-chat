import { readFileSync, writeFileSync, existsSync } from "fs";
import { SESSIONS_FILE } from "./config.js";

/**
 * Load all sessions from the sessions file
 * @returns {Object} Object containing all sessions, keyed by session ID
 */
export function loadSessions() {
  if (!existsSync(SESSIONS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(SESSIONS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Save sessions to the sessions file
 * @param {Object} sessions - Object containing all sessions, keyed by session ID
 */
export function saveSessions(sessions) {
  writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}
