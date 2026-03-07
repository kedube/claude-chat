/**
 * Normalize message content for backward compatibility
 * Old format: { role, content: "string" }
 * New format: { role, content: [{ type: "text", text: "..." }, { type: "file_ref", ... }] }
 *
 * @param {Object} message - Message object with role and content
 * @returns {Object} Message with normalized content (always array format)
 */
export function normalizeMessageContent(message) {
  // If content is already an array, it's new format
  if (Array.isArray(message.content)) {
    return message;
  }

  // Old format - convert to new format
  return {
    ...message,
    content: [{ type: "text", text: message.content }]
  };
}
