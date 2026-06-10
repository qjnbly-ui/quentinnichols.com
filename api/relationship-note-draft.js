const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");

const MODEL = "llama-3.3-70b-versatile";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const STOPWORDS = new Set([
  "and",
  "about",
  "with",
  "from",
  "that",
  "this",
  "they",
  "them",
  "were",
  "was",
  "for",
  "the",
  "his",
  "her",
  "their",
  "our",
  "you",
  "visited",
  "talked",
  "discussed",
  "mentioned",
  "said",
  "met",
  "saw",
]);

function cleanText(value, maxLength = 5000) {
  return String(value || "").trim().slice(0, maxLength);
}

function uniqueList(values, limit = 10) {
  return [...new Set(values.map((value) => cleanText(value, 80)).filter(Boolean))].slice(0, limit);
}

function titleCase(value) {
  return cleanText(value, 120)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function normalizePeople(people) {
  return people.map((person) => {
    const aliases = uniqueList([
      person.name,
      person.preferred_name,
      person.name?.split(/\s+/)[0],
      ...(Array.isArray(person.tags) ? person.tags : []),
    ].filter(Boolean), 8);
    return {
      id: person.id,
      name: person.name,
      tags: Array.isArray(person.tags) ? person.tags : [],
      aliases,
    };
  });
}

function findKnownPeople(note, people) {
  const lowerNote = note.toLowerCase();
  return people
    .map((person) => {
      const matchedAlias = person.aliases.find((alias) => {
        const lowerAlias = alias.toLowerCase();
        if (lowerAlias.length < 3) return false;
        return new RegExp(`\\b${lowerAlias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lowerNote);
      });
      return matchedAlias ? { ...person, matchedAlias, confidence: matchedAlias === person.name ? 0.96 : 0.82 } : null;
    })
    .filter(Boolean);
}

function findPossibleNames(note, knownPeople) {
  const knownNames = new Set(knownPeople.flatMap((person) => person.aliases.map((alias) => alias.toLowerCase())));
  const matches = note.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  return uniqueList(matches, 8)
    .filter((name) => !knownNames.has(name.toLowerCase()))
    .filter((name) => !STOPWORDS.has(name.toLowerCase()))
    .map((name) => ({ name: titleCase(name), confidence: 0.45 }));
}

function extractTopics(note) {
  const phrases = [
    "graduation",
    "dinner",
    "roof",
    "work",
    "job",
    "promotion",
    "surgery",
    "exam",
    "trip",
    "school",
    "family",
    "fire",
    "gym",
    "project",
    "appointment",
  ];
  const lowerNote = note.toLowerCase();
  return uniqueList(phrases.filter((phrase) => lowerNote.includes(phrase)), 8);
}

function extractDateHint(note) {
  const lowerNote = note.toLowerCase();
  const weekday = WEEKDAYS.find((day) => new RegExp(`\\b${day}\\b`, "i").test(lowerNote));
  if (weekday) return weekday;
  const relative = ["today", "tomorrow", "tonight", "next week", "next month"].find((term) => lowerNote.includes(term));
  if (relative) return relative;
  const dateMatch = note.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i);
  return dateMatch?.[0] || "";
}

function extractMemoryCards(note) {
  const cards = [];
  const daughter = note.match(/\b(?:daughter|kid|son|wife|husband|spouse|mom|dad|mother|father)\s+([A-Z][a-z]+)\b/);
  if (daughter) {
    cards.push({ label: titleCase(daughter[0].replace(daughter[1], "").trim()), value: daughter[1], confidence: 0.72 });
  }
  const worried = note.match(/\b(?:worried|concerned)\s+about\s+([^.!?]+)/i);
  if (worried) {
    cards.push({ label: "Concern", value: cleanText(worried[1], 180), confidence: 0.68 });
  }
  const goal = note.match(/\b(?:goal|trying|wants|hopes)\s+(?:to|is|for)?\s*([^.!?]+)/i);
  if (goal) {
    cards.push({ label: "Goal", value: cleanText(goal[1], 180), confidence: 0.6 });
  }
  return cards.slice(0, 4);
}

function extractReminder(note, topics, dateHint) {
  const lowerNote = note.toLowerCase();
  const hasFollowUpSignal = /\b(ask|follow up|check|remind|next time|later)\b/.test(lowerNote);
  const importantTopic = topics.find((topic) => ["exam", "surgery", "promotion", "roof", "graduation", "dinner"].includes(topic));
  if (!hasFollowUpSignal && !importantTopic) return [];
  const title = hasFollowUpSignal
    ? cleanText(note.split(/[.!?]/).find((sentence) => /\b(ask|follow up|check|remind)\b/i.test(sentence)) || `Follow up about ${importantTopic || "conversation"}`, 160)
    : `Ask about ${importantTopic}`;
  return [{ title, details: dateHint ? `Possible timing mentioned: ${dateHint}` : "", confidence: 0.62 }];
}

function buildScriptDraft(note, people) {
  const matchedPeople = findKnownPeople(note, people);
  const possiblePeople = findPossibleNames(note, matchedPeople);
  const topics = extractTopics(note);
  const dateHint = extractDateHint(note);
  const memoryCards = extractMemoryCards(note);
  const reminders = extractReminder(note, topics, dateHint);
  return {
    source: "script",
    summary: cleanText(note.split(/[.!?]/).find(Boolean) || note, 220),
    people: matchedPeople.map((person) => ({
      id: person.id,
      name: person.name,
      matchedAlias: person.matchedAlias,
      confidence: person.confidence,
      selected: true,
    })),
    possiblePeople,
    interaction: {
      location: "",
      mood: "",
      topics,
      dateHint,
      notes: note,
    },
    memoryCards,
    reminders,
    questions: possiblePeople.length
      ? [`Did you mean an existing person when you mentioned ${possiblePeople.map((person) => person.name).join(", ")}?`]
      : [],
  };
}

function safeJsonFromText(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function buildAiDraft(note, people, scriptDraft) {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return scriptDraft;

  const peopleContext = people.map((person) => ({
    id: person.id,
    name: person.name,
    aliases: person.aliases,
    tags: person.tags,
  }));

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.1,
      max_tokens: 1200,
      messages: [
        {
          role: "system",
          content:
            "You organize Quentin Nichols' private relationship notes. Return only valid JSON. Do not invent facts. Prefer existing people when names clearly match. If ambiguous, ask a question instead of assuming.",
        },
        {
          role: "user",
          content: JSON.stringify({
            note,
            existingPeople: peopleContext,
            scriptDraft,
            requiredShape: {
              summary: "short summary",
              people: [{ id: "existing id only", name: "name", matchedAlias: "alias", confidence: 0.0, selected: true }],
              possiblePeople: [{ name: "new or ambiguous name", confidence: 0.0 }],
              interaction: { location: "", mood: "", topics: [], dateHint: "", notes: note },
              memoryCards: [{ label: "", value: "", confidence: 0.0 }],
              reminders: [{ title: "", details: "", confidence: 0.0 }],
              questions: [],
            },
          }),
        },
      ],
    }),
  });

  if (!response.ok) return scriptDraft;
  const payload = await response.json().catch(() => ({}));
  const parsed = safeJsonFromText(payload?.choices?.[0]?.message?.content);
  if (!parsed || typeof parsed !== "object") return scriptDraft;
  return {
    ...scriptDraft,
    ...parsed,
    source: "ai",
    interaction: {
      ...scriptDraft.interaction,
      ...(parsed.interaction && typeof parsed.interaction === "object" ? parsed.interaction : {}),
      notes: note,
    },
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabaseRest } = await getAuthedSupabase(req);
    const body = await readJsonBody(req);
    const note = cleanText(body.note, 5000);
    if (!note) {
      json(res, 400, { error: "A note is required." });
      return;
    }

    const peopleResponse = await supabaseRest(
      "people?select=id,name,preferred_name,tags,email,phone,overview&order=updated_at.desc"
    );
    const peoplePayload = await peopleResponse.json().catch(() => []);
    if (!peopleResponse.ok) {
      json(res, peopleResponse.status, { error: peoplePayload?.message || "Unable to load people." });
      return;
    }

    const people = normalizePeople(peoplePayload);
    const scriptDraft = buildScriptDraft(note, people);
    const draft = body.useAi === false ? scriptDraft : await buildAiDraft(note, people, scriptDraft);

    json(res, 200, { draft });
  } catch (error) {
    await handleApiError(res, error);
  }
};
