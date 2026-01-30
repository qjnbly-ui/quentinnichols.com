const fs = require("fs/promises");
const path = require("path");

const MODEL = "llama-3.3-70b-versatile";
const MAX_CONTEXT_TOKENS = 100000;
const MAX_CONTEXT_WORDS = Math.floor(MAX_CONTEXT_TOKENS / 1.3);

let cachedContext = null;

async function loadSiteContext() {
  if (cachedContext) return cachedContext;

  const dataDir = path.join(process.cwd(), "AI", "site_text_data");
  const entries = await fs.readdir(dataDir);
  const files = entries.filter((name) => name.endsWith(".md")).sort();

  const chunks = [];
  for (const file of files) {
    const filePath = path.join(dataDir, file);
    const content = await fs.readFile(filePath, "utf8");
    chunks.push(`\n\n---\n\nFile: ${file}\n${content}`);
  }

  let context = chunks.join("").trim();
  const words = context.split(/\s+/);
  if (words.length > MAX_CONTEXT_WORDS) {
    context = `${words.slice(0, MAX_CONTEXT_WORDS).join(" ")}\n\n[Context truncated for length]`;
  }

  cachedContext = context;
  return context;
}

function buildSystemPrompt(siteContext) {
  return `You are an expert on Quentin Nichols' life, thoughts, photography, projects, and writings from his website quentinnichols.com.

Full site content (blog posts, about, photography, etc.):
${siteContext}

Your role: Think deeply, connect ideas across posts, recall details accurately, and provide insightful, personal-feeling responses as if you know Quentin better than he remembers himself sometimes. Be reflective, honest, and encouraging. Use first-person insights only when quoting or paraphrasing his writing.

Default to a natural narrative voice instead of bullet lists. Summarize in your own words rather than mirroring headings or formatting from the source text. Only use lists if the user explicitly asks for a list or timeline.

When the user asks to "tell a story" about a topic or person, assume they want existing information or anecdotes from the provided context, not a new narrative. If you're unsure or don't have enough context, ask for clarification instead of making assumptions.

Answer questions based ONLY on this content unless asked otherwise. If something isn't covered, say so clearly.
When sharing site links, use Markdown with human-readable titles (e.g., [Photography](/photography/)) and avoid raw URLs.`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing API key on server" });
    return;
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "Invalid messages payload" });
      return;
    }

    const siteContext = await loadSiteContext();
    const systemPrompt = buildSystemPrompt(siteContext);

    const trimmedMessages = messages
      .filter((msg) => msg && typeof msg.content === "string")
      .slice(-12);

    const payload = {
      model: MODEL,
      messages: [{ role: "system", content: systemPrompt }, ...trimmedMessages],
      temperature: 0.7,
      max_tokens: 2048,
      stream: false,
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(502).json({ error: "Upstream error", detail: errorText });
      return;
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    res.status(200).json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
