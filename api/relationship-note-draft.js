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
  "he",
  "she",
  "it",
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
  const petNames = new Set(extractPetNames(note).map((name) => name.toLowerCase()));
  const placeNames = new Set(extractPlaceNames(note).map((name) => name.toLowerCase()));
  const explicitMatches = [];
  const explicitPatterns = [
    /\b(?:met|saw|visited with|talked to|spoke with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=\s+(?:at|after|today|yesterday|and|about|because)\b|[.,!?]|$)/gi,
    /\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=\s+(?:at|after|today|yesterday|and|about|because)\b|[.,!?]|$)/gi,
  ];
  explicitPatterns.forEach((pattern) => {
    for (const match of note.matchAll(pattern)) {
      explicitMatches.push(match[1]);
    }
  });

  const matches = explicitMatches.length ? explicitMatches : note.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  return uniqueList(matches, 8)
    .filter((name) => !knownNames.has(name.toLowerCase()))
    .filter((name) => !petNames.has(name.toLowerCase()))
    .filter((name) => !placeNames.has(name.toLowerCase()))
    .filter((name) => !STOPWORDS.has(name.toLowerCase()))
    .map((name) => ({ name: titleCase(name), confidence: explicitMatches.length ? 0.9 : 0.45 }));
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
  const relative = ["next month", "next week", "tomorrow", "tonight", "today"].find((term) => lowerNote.includes(term));
  if (relative) return relative;
  const dateMatch = note.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i);
  return dateMatch?.[0] || "";
}

function extractPetNames(note) {
  const names = [];
  const patterns = [
    /\b(?:dog|cat|pet|border collie|horse)\s+(?:named|called)\s+([A-Z][a-z]+)\b/gi,
    /\b([A-Z][a-z]+)\s+(?:the\s+)?(?:dog|cat|border collie|horse)\b/gi,
  ];
  patterns.forEach((pattern) => {
    for (const match of note.matchAll(pattern)) {
      names.push(match[1]);
    }
  });
  return uniqueList(names, 6);
}

function extractPlaceNames(note) {
  const names = [];
  const patterns = [
    /\b(?:trip|travel|vacation)\s+to\s+([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,4})/g,
    /\bplanning\s+a\s+trip\s+to\s+([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*){0,4})/g,
  ];
  patterns.forEach((pattern) => {
    for (const match of note.matchAll(pattern)) {
      names.push(match[1].replace(/\s+(?:next|this|last)\b.*$/i, "").trim());
    }
  });
  return uniqueList(names, 6);
}

function extractMemoryCards(note) {
  const cards = [];
  const daughter = note.match(/\b(?:daughter|kid|son|wife|husband|spouse|mom|dad|mother|father)\s+([A-Z][a-z]+)\b/);
  if (daughter) {
    cards.push({ label: titleCase(daughter[0].replace(daughter[1], "").trim()), value: daughter[1], confidence: 0.72 });
  }
  const petNames = extractPetNames(note);
  petNames.forEach((name) => {
    const petType = note.match(new RegExp(`\\b(border collie|dog|cat|pet|horse)\\s+(?:named\\s+)?${name}\\b`, "i"))?.[1] || "Pet";
    cards.push({ label: titleCase(petType), value: name, confidence: 0.88 });
  });
  const hobby = note.match(/\b((?:repairs|collects|builds|restores|photographs|makes)\s+[^.!?]+?)\s+as a hobby\b/i)
    || note.match(/\bhobby\s+(?:is|:)\s*([^.!?]+)/i);
  if (hobby) {
    const value = cleanText(hobby[1].replace(/^(?:he|she|they)\s+/i, ""), 180);
    cards.push({ label: "Hobby", value, confidence: 0.78 });
  }
  const trip = note.match(/\b(?:trip|travel|vacation)\s+to\s+([^.!?]+)/i)
    || note.match(/\bplanning\s+a\s+trip\s+to\s+([^.!?]+)/i);
  if (trip) {
    const tripValue = trip[1].split(/\s+and\s+(?:asked|said|mentioned|wants|needs)\b/i)[0];
    cards.push({ label: "Upcoming Trip", value: cleanText(tripValue, 180), confidence: 0.78 });
  }
  const worried = note.match(/\b(?:worried|concerned)\s+about\s+([^.!?]+)/i);
  if (worried) {
    cards.push({ label: "Concern", value: cleanText(worried[1], 180), confidence: 0.68 });
  }
  const goal = note.match(/\b(?:goal|trying|wants|hopes)\s+(?:to|is|for)?\s*([^.!?]+)/i);
  if (goal) {
    cards.push({ label: "Goal", value: cleanText(goal[1], 180), confidence: 0.6 });
  }
  return cards.slice(0, 6);
}

function mergeCards(primaryCards, fallbackCards) {
  const seen = new Set();
  return [...primaryCards, ...fallbackCards]
    .filter((card) => card && cleanText(card.label, 120) && cleanText(card.value, 1000))
    .filter((card) => {
      const key = `${cleanText(card.label, 120).toLowerCase()}::${cleanText(card.value, 1000).toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function sanitizeDraft(draft, scriptDraft, note) {
  const petNames = new Set(extractPetNames(note).map((name) => name.toLowerCase()));
  const possiblePeople = Array.isArray(draft.possiblePeople) ? draft.possiblePeople : [];
  const questions = Array.isArray(draft.questions) ? draft.questions : [];
  return {
    ...scriptDraft,
    ...draft,
    people: Array.isArray(draft.people) ? draft.people : scriptDraft.people,
    possiblePeople: possiblePeople.filter((person) => !petNames.has(String(person.name || "").toLowerCase())),
    memoryCards: mergeCards(Array.isArray(draft.memoryCards) ? draft.memoryCards : [], scriptDraft.memoryCards),
    reminders: Array.isArray(draft.reminders) && draft.reminders.length ? draft.reminders : scriptDraft.reminders,
    questions: questions.filter((question) => ![...petNames].some((name) => question.toLowerCase().includes(name))),
    interaction: {
      ...scriptDraft.interaction,
      ...(draft.interaction && typeof draft.interaction === "object" ? draft.interaction : {}),
      notes: note,
    },
  };
}

function extractReminder(note, topics, dateHint) {
  const lowerNote = note.toLowerCase();
  const hasFollowUpSignal = /\b(ask|follow up|check|remind|next time|later)\b/.test(lowerNote);
  const importantTopic = topics.find((topic) => ["exam", "surgery", "promotion", "roof", "graduation", "dinner"].includes(topic));
  if (!hasFollowUpSignal && !importantTopic) return [];
  const reminderMatch = note.match(/\bremind\s+(?:him|her|them|me)?\s*(?:about|to)?\s*([^.!?]+)/i)
    || note.match(/\b(?:check|follow up(?: on)?|ask about)\s+([^.!?]+)/i);
  if (reminderMatch) {
    const reminderText = cleanText(reminderMatch[1].replace(/^checking\s+/i, "check "), 160);
    return [{
      title: titleCase(reminderText),
      details: dateHint ? `Possible timing mentioned: ${dateHint}` : "",
      confidence: 0.74,
    }];
  }
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
            "You organize Quentin Nichols' private relationship notes. Return only valid JSON. Do not invent facts. Prefer existing people when names clearly match. Pets, animals, projects, places, and organizations are memory cards or topics, not people profiles. If ambiguous, ask a question instead of assuming.",
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
  return sanitizeDraft({ ...parsed, source: "ai" }, scriptDraft, note);
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
