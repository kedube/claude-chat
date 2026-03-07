/**
 * Detect if message is a research request (keyword-based)
 * @param {string} message - The user's message
 * @returns {boolean} True if the message contains research keywords
 */
export function isResearchRequest(message) {
  const lowerMsg = message.toLowerCase();
  const researchKeywords = [
    "research", "investigate", "analyze", "compare", "explore",
    "find information about", "learn about", "tell me about",
    "what are the latest", "summarize", "overview of", "deep dive"
  ];
  return researchKeywords.some(keyword => lowerMsg.includes(keyword));
}

/**
 * Generate sub-queries for research mode
 * @param {string} topic - The research topic
 * @param {string} modelId - The model ID to use for generation
 * @param {Object} client - Anthropic Vertex AI client
 * @returns {Promise<Array<string>>} Array of 3-5 search queries
 */
export async function generateResearchQueries(topic, modelId, client) {
  const prompt = `You are a research assistant. Given a research topic, break it down into 3-5 focused search queries that would comprehensively cover the topic.

Research Topic: ${topic}

Return ONLY a JSON array of search query strings, nothing else. Example format:
["query 1", "query 2", "query 3"]

Queries should be:
- Specific and focused
- Cover different aspects of the topic
- Suitable for web search
- Ordered from general to specific`;

  try {
    const response = await client.messages.create({
      model: modelId,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0].text.trim();
    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const queries = JSON.parse(jsonMatch[0]);
      return Array.isArray(queries) ? queries.slice(0, 5) : [];
    }
    return [];
  } catch (err) {
    console.error("Failed to generate research queries:", err);
    return [];
  }
}

/**
 * Execute a single search query using web search tool
 * @param {string} query - The search query
 * @param {string} modelId - The model ID to use
 * @param {Object} client - Anthropic Vertex AI client
 * @returns {Promise<Object>} { results: Array, text: string }
 */
export async function executeSearch(query, modelId, client) {
  try {
    const stream = await client.messages.stream({
      model: modelId,
      max_tokens: 2048,
      messages: [{ role: "user", content: query }],
      tools: [{ name: "web_search", type: "web_search_20250305" }],
    });

    const finalMessage = await stream.finalMessage();

    // Extract search results
    const results = [];
    for (const block of finalMessage.content) {
      if (block.type === 'web_search_tool_result') {
        const searchResults = Array.isArray(block.content) ? block.content
          .filter(r => r.type === 'web_search_result')
          .map(r => ({ title: r.title, url: r.url, snippet: r.content || '' })) : [];
        results.push(...searchResults);
      }
    }

    // Extract text response
    const text = finalMessage.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('');

    return { results, text };
  } catch (err) {
    console.error(`Failed to execute search for query: ${query}`, err);
    return { results: [], text: '' };
  }
}
