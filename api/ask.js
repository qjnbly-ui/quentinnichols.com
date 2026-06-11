const fs = require("fs/promises");
const path = require("path");
const { enforceRateLimit } = require("./_rate-limit");
const { getAuthedSupabase } = require("./_supabase-request");

const MODEL = "llama-3.3-70b-versatile";
const MAX_CONTEXT_TOKENS = 100000;
const MAX_CONTEXT_WORDS = Math.floor(MAX_CONTEXT_TOKENS / 1.3);
const MAX_PRIVATE_CONTEXT_WORDS = 12000;

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

async function loadPrivateTable(supabaseRest, path) {
  const response = await supabaseRest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(payload)) return [];
  return payload;
}

function truncateWords(text, maxWords) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(text || "");
  return `${words.slice(0, maxWords).join(" ")}\n\n[Private context truncated for length]`;
}

function formatBullets(items, formatter) {
  const lines = items.map(formatter).filter(Boolean);
  return lines.length ? lines.join("\n") : "- None loaded";
}

async function loadPrivateAppContext(req) {
  try {
    const { supabaseRest } = await getAuthedSupabase(req);
    const [
      people,
      interactions,
      memoryCards,
      reminders,
      calendarEvents,
      tasks,
      notes,
      aiContextItems,
    ] = await Promise.all([
      loadPrivateTable(
        supabaseRest,
        "people?select=id,name,preferred_name,phone,email,tags,first_met_at,first_met_location,overview,updated_at&order=updated_at.desc&limit=80"
      ),
      loadPrivateTable(
        supabaseRest,
        "person_interactions?select=id,person_id,occurred_at,location,notes,mood,topics,ai_summary&order=occurred_at.desc&limit=160"
      ),
      loadPrivateTable(
        supabaseRest,
        "person_memory_cards?select=id,person_id,category,label,value,confidence,updated_at&order=updated_at.desc&limit=160"
      ),
      loadPrivateTable(
        supabaseRest,
        "person_follow_up_reminders?select=id,person_id,title,details,remind_at,status,priority,updated_at&order=created_at.desc&limit=120"
      ),
      loadPrivateTable(
        supabaseRest,
        "calendar_events?select=id,title,description,location,starts_at,ends_at,status,source&order=starts_at.asc&limit=80"
      ),
      loadPrivateTable(
        supabaseRest,
        "tasks?select=id,title,description,status,priority,due_at,completed_at,source&order=due_at.asc&limit=80"
      ),
      loadPrivateTable(
        supabaseRest,
        "notes?select=id,title,body,source,updated_at&order=updated_at.desc&limit=80"
      ),
      loadPrivateTable(
        supabaseRest,
        "ai_context_items?select=id,source_type,source_id,title,content,importance,updated_at&order=importance.desc&limit=120"
      ),
    ]);

    const peopleById = new Map(people.map((person) => [person.id, person]));

    const context = `
Private app context from Supabase. This is current runtime data for Quentin's private dashboard. Treat it as private, user-owned data. Use it when relevant, but do not expose unrelated private details unless Quentin asks.

People:
${formatBullets(people, (person) => {
  const tags = Array.isArray(person.tags) && person.tags.length ? ` tags: ${person.tags.join(", ")}` : "";
  const contact = [person.email, person.phone].filter(Boolean).join(" / ");
  return `- ${person.name}${person.preferred_name ? ` (${person.preferred_name})` : ""}${tags}${contact ? ` contact: ${contact}` : ""}${person.first_met_location ? ` first met: ${person.first_met_location}` : ""}${person.overview ? ` overview: ${person.overview}` : ""}`;
})}

Recent conversations:
${formatBullets(interactions, (interaction) => {
  const person = peopleById.get(interaction.person_id);
  const topics = Array.isArray(interaction.topics) && interaction.topics.length ? ` topics: ${interaction.topics.join(", ")}` : "";
  return `- ${person?.name || "Unknown person"} on ${interaction.occurred_at || "unknown date"}${interaction.location ? ` at ${interaction.location}` : ""}${topics}: ${interaction.ai_summary || interaction.notes || ""}`;
})}

Memory cards:
${formatBullets(memoryCards, (card) => {
  if (String(card.label || "").trim().toLowerCase() === "raw note") return "";
  const person = peopleById.get(card.person_id);
  return `- ${person?.name || "Unknown person"} | ${card.label}: ${card.value}`;
})}

Follow-up reminders:
${formatBullets(reminders, (reminder) => {
  const person = peopleById.get(reminder.person_id);
  return `- ${person?.name || "Unknown person"} | ${reminder.title}${reminder.remind_at ? ` at ${reminder.remind_at}` : ""} | ${reminder.status || "open"}${reminder.details ? ` | ${reminder.details}` : ""}`;
})}

Calendar events:
${formatBullets(calendarEvents, (event) => `- ${event.starts_at || "unscheduled"} | ${event.title}${event.location ? ` at ${event.location}` : ""}${event.description ? ` | ${event.description}` : ""}`)}

Tasks:
${formatBullets(tasks, (task) => `- ${task.status || "todo"} | ${task.priority || "normal"} | ${task.title}${task.due_at ? ` due ${task.due_at}` : ""}${task.description ? ` | ${task.description}` : ""}`)}

Notes:
${formatBullets(notes, (note) => `- ${note.title || "Untitled note"} | ${String(note.body || "").slice(0, 700)}`)}

AI context items:
${formatBullets(aiContextItems, (item) => `- ${item.source_type} | ${item.title || "Untitled"} | importance ${item.importance || 0} | ${String(item.content || "").slice(0, 700)}`)}
`.trim();

    return truncateWords(context, MAX_PRIVATE_CONTEXT_WORDS);
  } catch (error) {
    return "Private app context could not be loaded for this request.";
  }
}

function buildSystemPrompt(siteContext, privateAppContext) {
  return `You are an expert on Quentin Nichols' life, thoughts, photography, projects, and writings from his website quentinnichols.com.

The current user is Quentin Nichols. Speak to him directly as Quentin, not as an outside visitor asking about Quentin. Treat "you" as Quentin unless the message clearly refers to someone else.

Full site content (blog posts, about, photography, etc.):
${siteContext}

Current private dashboard context:
${privateAppContext}

Your role: Think deeply, connect ideas across posts, recall details accurately, and provide insightful, personal-feeling responses as if you know Quentin better than he remembers himself sometimes. Be reflective, honest, and encouraging. Use first-person insights only when quoting or paraphrasing his writing.

Default to a natural narrative voice instead of bullet lists. Summarize in your own words rather than mirroring headings or formatting from the source text. Only use lists if the user explicitly asks for a list or timeline.

Scripting rules: Ground responses in the provided text and avoid inventing facts. Keep the text's tone and style. Light interpretive commentary is allowed if it is clearly framed as interpretation and stays consistent with the text. Quote or paraphrase accurately without altering meaning. Be transparent about limitations when context is insufficient. Use the provided text as the primary source and only use external knowledge when explicitly permitted.

When the user asks to "tell a story" about a topic or person, assume they want existing information or anecdotes from the provided context, not a new narrative. If you're unsure or don't have enough context, ask for clarification instead of making assumptions.

Avoid repeating the same points across consecutive responses unless the user asks for a recap or comparison.

Answer questions based ONLY on the website content and private dashboard context unless asked otherwise. If something isn't covered, say so clearly.
When sharing site links, use Markdown with human-readable titles (e.g., [Photography](/photography/)) and avoid raw URLs.`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const askRate = enforceRateLimit(req, res, {
    keyPrefix: "ask",
    windowMs: Number(process.env.ASK_RATE_LIMIT_WINDOW_MS || 60_000),
    limit: Number(process.env.ASK_RATE_LIMIT_MAX || 20),
  });
  if (!askRate.allowed) {
    res.status(429).json({ error: "Rate limit exceeded. Please try again shortly." });
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

    const [siteContext, privateAppContext] = await Promise.all([
      loadSiteContext(),
      loadPrivateAppContext(req),
    ]);
    const systemPrompt = buildSystemPrompt(siteContext, privateAppContext);

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
