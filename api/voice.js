const fs = require("fs/promises");
const path = require("path");
const { enforceRateLimit } = require("./_rate-limit");

const MODEL = "llama-3.3-70b-versatile";
const MAX_CONTEXT_TOKENS = 100000;
const MAX_CONTEXT_WORDS = Math.floor(MAX_CONTEXT_TOKENS / 1.3);

let cachedContext = null;

async function readRawBody(req) {
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  return Buffer.concat(buffers);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

async function readMultipartForm(req) {
  const contentType = String(req.headers["content-type"] || "");
  const raw = await readRawBody(req);
  const request = new Request("http://localhost/api/voice", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: raw,
  });
  return request.formData();
}

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

Scripting rules: Ground responses in the provided text and avoid inventing facts. Keep the text's tone and style. Light interpretive commentary is allowed if it is clearly framed as interpretation and stays consistent with the text. Quote or paraphrase accurately without altering meaning. Be transparent about limitations when context is insufficient. Use the provided text as the primary source and only use external knowledge when explicitly permitted.

When the user asks to "tell a story" about a topic or person, assume they want existing information or anecdotes from the provided context, not a new narrative. If you're unsure or don't have enough context, ask for clarification instead of making assumptions.

Avoid repeating the same points across consecutive responses unless the user asks for a recap or comparison.

Answer questions based ONLY on this content unless asked otherwise. If something isn't covered, say so clearly.
When sharing site links, use Markdown with human-readable titles (e.g., [Photography](/photography/)) and avoid raw URLs.`;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((msg) => msg && typeof msg.content === "string")
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content.slice(0, 2000),
    }))
    .slice(-12);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function transcribeAudio(apiKey, audioInput, mimeType) {
  const audioBuffer = Buffer.isBuffer(audioInput) ? audioInput : Buffer.from(await audioInput.arrayBuffer());
  const fileExt = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: mimeType }), `speech.${fileExt}`);
  formData.append("model", process.env.STT_MODEL || "whisper-large-v3-turbo");
  formData.append("temperature", "0");
  formData.append("response_format", "json");
  formData.append("language", "en");

  const response = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    },
    20000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Transcription failed");
  }

  const data = await response.json();
  return String(data?.text || "").trim();
}

async function generateReply(apiKey, messages) {
  const siteContext = await loadSiteContext();
  const payload = {
    model: MODEL,
    messages: [{ role: "system", content: buildSystemPrompt(siteContext) }, ...messages],
    temperature: 0.7,
    max_tokens: 2048,
    stream: false,
  };

  const response = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    45000
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "AI request failed");
  }

  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || "").trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const rate = enforceRateLimit(req, res, {
    keyPrefix: "voice",
    windowMs: Number(process.env.VOICE_RATE_LIMIT_WINDOW_MS || 60_000),
    limit: Number(process.env.VOICE_RATE_LIMIT_MAX || 20),
  });
  if (!rate.allowed) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }));
    return;
  }

  try {
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing API key on server" }));
      return;
    }

    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    let audioInput = null;
    let mimeType = "audio/webm";
    let messages = [];

    if (contentType.includes("application/json")) {
      const body = await readJsonBody(req);
      const audioBase64 = String(body.audio || "");
      if (!audioBase64) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing audio" }));
        return;
      }
      audioInput = Buffer.from(audioBase64, "base64");
      mimeType = String(body.mimeType || mimeType);
      messages = normalizeMessages(body.messages || []);
    } else {
      const form = await readMultipartForm(req);
      const audioFile = form.get("audio");
      if (!audioFile || typeof audioFile.arrayBuffer !== "function") {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing audio" }));
        return;
      }
      audioInput = audioFile;
      mimeType = String(audioFile.type || form.get("mimeType") || mimeType);
      messages = normalizeMessages(JSON.parse(String(form.get("messages") || "[]")));
    }

    const text = await transcribeAudio(apiKey, audioInput, mimeType);
    if (!text) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ text: "", reply: "" }));
      return;
    }

    const reply = await generateReply(apiKey, [...messages, { role: "user", content: text }]);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ text, reply }));
  } catch (error) {
    res.statusCode = error.name === "AbortError" ? 504 : 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Voice request failed" }));
  }
};
