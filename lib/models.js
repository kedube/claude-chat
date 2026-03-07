/**
 * All known models - probed on startup to check availability
 */
export const ALL_MODELS = [
  { alias: "claude-opus-4-6", label: "Opus 4.6", description: "Latest, most intelligent", modelId: "claude-opus-4-6" },
  { alias: "claude-sonnet-4-6", label: "Sonnet 4.6", description: "Latest, fast and capable", modelId: "claude-sonnet-4-6" },
  { alias: "sonnet", label: "Sonnet 4.5", description: "Best for everyday tasks", modelId: "claude-sonnet-4-5@20250929" },
  { alias: "opus", label: "Opus 4.5", description: "Most capable for complex work", modelId: "claude-opus-4-5@20251101" },
  { alias: "haiku", label: "Haiku 4.5", description: "Fastest for quick answers", modelId: "claude-haiku-4-5@20251001" },
];

/**
 * Probe all models to check which are available
 * @param {Object} client - Anthropic Vertex AI client
 * @returns {Promise<Array>} Array of available models
 */
export async function probeModels(client) {
  console.log("Probing model availability...");
  const results = await Promise.allSettled(
    ALL_MODELS.map(async (m) => {
      try {
        await client.messages.create({
          model: m.modelId,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        });
        return m;
      } catch (err) {
        console.log(`  ${m.alias} (${m.modelId}): unavailable - ${err.message?.slice(0, 80)}`);
        return null;
      }
    })
  );
  const availableModels = results
    .filter(r => r.status === "fulfilled" && r.value)
    .map(r => r.value);
  console.log(`Available models: ${availableModels.map(m => m.alias).join(", ")}`);
  return availableModels;
}
