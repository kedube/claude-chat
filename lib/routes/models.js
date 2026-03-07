import { ALL_MODELS } from "../models.js";

/**
 * Setup models API routes
 * @param {Object} app - Express app instance
 * @param {Array} availableModels - Array of available models after probing
 */
export function setupModelsRoutes(app, availableModels) {
  /**
   * GET /api/models
   * Returns list of available models (after probing) or all models if probing not complete
   */
  app.get("/api/models", (_req, res) => {
    res.json(availableModels || ALL_MODELS);
  });
}
