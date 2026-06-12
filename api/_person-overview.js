function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

async function loadRows(supabaseRest, path, errorMessage) {
  const response = await supabaseRest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || errorMessage);
    error.statusCode = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

function firstSentence(value, maxLength = 260) {
  const text = cleanText(value, maxLength).replace(/\s+/g, " ");
  if (!text) return "";
  const sentence = text.split(/(?<=[.!?])\s+/).find(Boolean) || text;
  return cleanText(sentence, maxLength);
}

function cleanMemoryLine(card) {
  const label = cleanText(card.label, 80);
  const value = cleanText(card.value, 260);
  if (!label || !value) return "";
  return `${label}: ${value}`;
}

const MODEL = process.env.RELATIONSHIP_OVERVIEW_MODEL || process.env.RELATIONSHIP_NOTE_MODEL || "openai/gpt-oss-120b";
const REASONING_EFFORT = process.env.RELATIONSHIP_REASONING_EFFORT || "medium";

function buildProfileOverview(person, interactions, memoryCards) {
  const name = cleanText(person?.name, 160) || "This person";
  const preferred = cleanText(person?.preferred_name, 160);
  const tags = Array.isArray(person?.tags) ? person.tags.map((tag) => cleanText(tag, 48)).filter(Boolean) : [];
  const topMemories = memoryCards
    .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
    .map(cleanMemoryLine)
    .filter(Boolean)
    .slice(0, 8);
  const topicList = [...new Set(interactions.flatMap((interaction) => (
    Array.isArray(interaction.topics) ? interaction.topics : []
  )).map((topic) => cleanText(topic, 48)).filter(Boolean))].slice(0, 8);
  const recentNotes = interactions
    .slice(0, 5)
    .map((interaction) => firstSentence(interaction.ai_summary || interaction.notes, 220))
    .filter(Boolean);

  const identityBits = [];
  if (preferred && preferred !== name) identityBits.push(`goes by ${preferred}`);
  if (tags.length) identityBits.push(`tagged ${tags.join(", ")}`);

  const sentences = [];
  sentences.push(identityBits.length ? `${name} ${identityBits.join(" and ")}.` : `${name} is a profile in your people notebook.`);
  if (topMemories.length) {
    sentences.push(`Key memory: ${topMemories.join("; ")}.`);
  }
  if (topicList.length) {
    sentences.push(`Your notes around this profile touch on ${topicList.join(", ")}.`);
  }
  if (recentNotes.length) {
    sentences.push(`Recent context: ${recentNotes.join(" ")}`);
  }

  return cleanText(sentences.join(" ").replace(/\s+/g, " "), 2000);
}

function profileContextForAi(person, interactions, memoryCards) {
  return {
    person: {
      name: person?.name || "",
      preferredName: person?.preferred_name || "",
      tags: Array.isArray(person?.tags) ? person.tags : [],
    },
    memoryCards: memoryCards
      .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
      .slice(0, 30)
      .map((card) => ({
        label: card.label || "",
        value: card.value || "",
        confidence: card.confidence || null,
      })),
    conversations: interactions.slice(0, 20).map((interaction) => ({
      occurredAt: interaction.occurred_at || "",
      topics: Array.isArray(interaction.topics) ? interaction.topics : [],
      summary: interaction.ai_summary || "",
      notes: interaction.notes || "",
    })),
  };
}

async function buildAiProfileOverview(person, interactions, memoryCards, fallbackOverview) {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackOverview;

  const context = profileContextForAi(person, interactions, memoryCards);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.25,
      max_tokens: 260,
      reasoning_effort: REASONING_EFFORT,
      reasoning_format: "hidden",
      messages: [
        {
          role: "system",
          content:
            "Rewrite a private people-notebook profile overview for Quentin. Use only the provided stored data. Write 2-4 natural sentences in second person where needed. Do not mention database fields, tags as tags, confidence scores, or the process. Do not invent facts. If the data is thin, still write a concise useful overview.",
        },
        {
          role: "user",
          content: JSON.stringify({
            context,
            currentFallbackOverview: fallbackOverview,
          }),
        },
      ],
    }),
  });

  if (!response.ok) return fallbackOverview;
  const payload = await response.json().catch(() => ({}));
  const overview = cleanText(payload?.choices?.[0]?.message?.content || "", 2000)
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
  return overview || fallbackOverview;
}

async function rebuildPersonOverview(supabaseRest, personId, options = {}) {
  const encodedPersonId = encodeURIComponent(personId);
  const [people, interactions, memoryCards] = await Promise.all([
    loadRows(
      supabaseRest,
      `people?select=id,name,preferred_name,tags&limit=1&id=eq.${encodedPersonId}`,
      "Unable to load person."
    ),
    loadRows(
      supabaseRest,
      `person_interactions?select=id,notes,topics,ai_summary,occurred_at&person_id=eq.${encodedPersonId}&order=occurred_at.desc&limit=40`,
      "Unable to load interactions."
    ),
    loadRows(
      supabaseRest,
      `person_memory_cards?select=id,label,value,confidence,updated_at&person_id=eq.${encodedPersonId}&order=updated_at.desc&limit=80`,
      "Unable to load memory cards."
    ),
  ]);
  const fallbackOverview = buildProfileOverview(people[0], interactions, memoryCards);
  const overview = options.useAi
    ? await buildAiProfileOverview(people[0], interactions, memoryCards, fallbackOverview)
    : fallbackOverview;
  if (!overview) return "";
  const response = await supabaseRest(`people?id=eq.${encodedPersonId}`, {
    method: "PATCH",
    body: { overview },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to update profile overview.");
    error.statusCode = response.status;
    throw error;
  }
  return overview;
}

module.exports = {
  rebuildPersonOverview,
};
