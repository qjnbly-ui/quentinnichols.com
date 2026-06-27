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

function isTemporaryMemoryCard(card) {
  const label = cleanText(card?.label, 80).toLowerCase();
  return ["upcoming event", "visit context", "appointment", "reminder", "dental work"].includes(label);
}

const MODEL = process.env.RELATIONSHIP_OVERVIEW_MODEL || process.env.RELATIONSHIP_NOTE_MODEL || "openai/gpt-oss-120b";
const REASONING_EFFORT = process.env.RELATIONSHIP_REASONING_EFFORT || "medium";
const OVERVIEW_MAX_TOKENS = Number(process.env.RELATIONSHIP_OVERVIEW_MAX_TOKENS || 520);

function titleCase(value) {
  return cleanText(value, 160)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function levenshtein(a, b) {
  const left = String(a || "").toLowerCase();
  const right = String(b || "").toLowerCase();
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const old = row[j];
      row[j] = left[i - 1] === right[j - 1]
        ? previous
        : Math.min(previous + 1, row[j] + 1, row[j - 1] + 1);
      previous = old;
    }
  }
  return row[right.length];
}

function profileNameVariants(person) {
  const name = cleanText(person?.name, 160);
  const preferred = cleanText(person?.preferred_name, 160);
  const parts = name.split(/\s+/).filter(Boolean);
  return [...new Set([name, preferred, parts[0], parts.slice(0, 2).join(" ")].filter((value) => value && value.length >= 3))];
}

function textMentionsProfile(text, person) {
  const haystack = String(text || "");
  const lowerHaystack = haystack.toLowerCase();
  const variants = profileNameVariants(person);
  if (variants.some((variant) => new RegExp(`\\b${variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(haystack))) {
    return true;
  }

  const firstName = cleanText(person?.name, 160).split(/\s+/)[0] || "";
  if (!firstName) return false;
  const possibleNames = haystack.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?\b/g) || [];
  return possibleNames.some((candidate) => {
    const firstCandidate = candidate.split(/\s+/)[0] || "";
    return levenshtein(firstCandidate, firstName) <= 2 && lowerHaystack.includes((person?.name || "").split(/\s+/).slice(-1)[0]?.toLowerCase() || "");
  });
}

function gradeText(value) {
  const grade = String(value || "").match(/\b(\d+)(?:st|nd|rd|th)?\s+grade\b/i);
  return grade ? `${grade[1]}th grade` : cleanText(value, 80);
}

function normalizeProfileFacts(facts, person) {
  const name = cleanText(person?.name, 160) || "This person";
  const factSet = new Set(facts.map((fact) => cleanText(fact, 260)).filter(Boolean));
  const specificSister = [...factSet].some((fact) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is your (?:younger|older) sister\\.$`, "i").test(fact));
  const specificBrother = [...factSet].some((fact) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is your (?:younger|older) brother\\.$`, "i").test(fact));
  if (specificSister) factSet.delete(`${name} is your sister.`);
  if (specificBrother) factSet.delete(`${name} is your brother.`);
  return [...factSet];
}

function extractProfileFacts(person, interactions, memoryCards) {
  const name = cleanText(person?.name, 160) || "This person";
  const facts = [];
  const seen = new Set();
  const addFact = (fact) => {
    const cleanFact = cleanText(fact, 260).replace(/\s+/g, " ");
    const key = cleanFact.toLowerCase();
    if (!cleanFact || seen.has(key)) return;
    seen.add(key);
    facts.push(cleanFact);
  };

  memoryCards.forEach((card) => {
    const label = cleanText(card.label, 80).toLowerCase();
    const value = cleanText(card.value, 300);
    if (!value) return;
    if (isTemporaryMemoryCard(card)) return;
    if (label.includes("school") && /\bgraduated\b/i.test(value)) {
      addFact(`${name} recently graduated ${gradeText(value)}.`);
    } else if (label.includes("family") && /\bgreat aunt\b/i.test(value)) {
      addFact(`${name} is your great aunt.`);
    } else if (label.includes("family") && /\baunt\b/i.test(value)) {
      addFact(`${name} is your aunt.`);
    } else if (label.includes("family") && /\bcousin\b/i.test(value)) {
      addFact(`${name} is your cousin.`);
    } else if (label.includes("family") && /\bsister\b/i.test(value)) {
      addFact(`${name} is your sister.`);
    } else {
      addFact(value.endsWith(".") ? value : `${value}.`);
    }
  });

  interactions.forEach((interaction) => {
    const text = cleanText(`${interaction.ai_summary || ""} ${interaction.notes || ""}`, 5000);
    if (!textMentionsProfile(text, person)) return;
    const escapedName = profileNameVariants(person).map((variant) => variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const relationPatterns = [
      { pattern: new RegExp(`\\bmy\\s+cousin\\s+(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "cousin" },
      { pattern: new RegExp(`\\bmy\\s+(younger\\s+)?sister\\s+(?:is\\s+)?(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "sister" },
      { pattern: new RegExp(`\\bmy\\s+(older\\s+)?brother\\s+(?:is\\s+)?(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "brother" },
    ];
    relationPatterns.forEach(({ pattern, relation }) => {
      const match = text.match(pattern);
      if (!match) return;
      const matchedName = match[2] || match[1] || "";
      if (textMentionsProfile(matchedName, person)) addFact(`${name} is your ${relation}.`);
    });

    const looseSibling = text.match(/\b(?:my\s+)?(younger|older)?\s*(sister|brother)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi) || [];
    looseSibling.forEach((phrase) => {
      if (!textMentionsProfile(phrase, person)) return;
      const relation = /\bbrother\b/i.test(phrase) ? "brother" : "sister";
      const age = phrase.match(/\b(younger|older)\b/i)?.[1]?.toLowerCase();
      addFact(`${name} is your ${age ? `${age} ` : ""}${relation}.`);
    });

    const graduation = text.match(new RegExp(`\\b(?:${escapedName})\\s+(?:just\\s+)?graduated\\s+([^.!?]+)`, "i"))
      || text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:just\s+)?graduated\s+([^.!?]+)/i);
    if (graduation && textMentionsProfile(graduation[0], person)) {
      addFact(`${name} recently graduated ${gradeText(graduation[2] || graduation[1])}.`);
    }
  });

  return normalizeProfileFacts(facts, person).slice(0, 8);
}

function memoryCardFromFact(fact, person) {
  const name = cleanText(person?.name, 160) || "This person";
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relation = fact.match(new RegExp(`^${escapedName} is your ((?:younger|older|great)\\s+)?(sister|brother|cousin|aunt|uncle|grandma|grandpa|grandmother|grandfather)\\.$`, "i"));
  if (relation) {
    return {
      category: "family",
      label: "Family Context",
      value: `${name} is your ${cleanText(`${relation[1] || ""}${relation[2]}`, 80)}.`,
      confidence: 1,
    };
  }

  const graduation = fact.match(new RegExp(`^${escapedName} recently graduated (.+)\\.$`, "i"));
  if (graduation) {
    return {
      category: "school",
      label: "School Milestone",
      value: `${name} graduated ${cleanText(graduation[1], 120)}.`,
      confidence: 1,
    };
  }

  return null;
}

function normalizedMemoryKey(card) {
  return [
    cleanText(card.label, 120).toLowerCase(),
    cleanText(card.value, 1000)
      .toLowerCase()
      .replace(/\bmy\b/g, "your")
      .replace(/[^a-z0-9]+/g, " ")
      .trim(),
  ].join(":");
}

async function backfillMemoryCardsFromFacts(supabaseRest, person, interactions, memoryCards) {
  const facts = extractProfileFacts(person, interactions, memoryCards);
  const existingKeys = new Set(memoryCards.map(normalizedMemoryKey));
  const rows = facts
    .map((fact) => memoryCardFromFact(fact, person))
    .filter(Boolean)
    .filter((card) => !existingKeys.has(normalizedMemoryKey(card)))
    .map((card) => ({
      owner_id: person.owner_id,
      person_id: person.id,
      category: card.category,
      label: card.label,
      value: card.value,
      confidence: card.confidence,
      metadata: { source: "overview_refresh" },
    }));

  if (!rows.length) return memoryCards;
  const response = await supabaseRest("person_memory_cards?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: rows,
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to backfill memory cards.");
    error.statusCode = response.status;
    throw error;
  }
  return [...payload, ...memoryCards];
}

function buildProfileOverview(person, interactions, memoryCards) {
  const name = cleanText(person?.name, 160) || "This person";
  const preferred = cleanText(person?.preferred_name, 160);
  const tags = Array.isArray(person?.tags) ? person.tags.map((tag) => cleanText(tag, 48)).filter(Boolean) : [];
  const profileFacts = extractProfileFacts(person, interactions, memoryCards);
  const topMemories = memoryCards
    .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
    .filter((card) => !isTemporaryMemoryCard(card))
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
  if (profileFacts.length) {
    sentences.push(profileFacts.join(" "));
  } else {
    sentences.push(identityBits.length ? `${name} ${identityBits.join(" and ")}.` : `${name} is a profile in your people notebook.`);
  }
  if (!profileFacts.length && topMemories.length) {
    sentences.push(`Key memory: ${topMemories.join("; ")}.`);
  }
  if (topicList.length) {
    sentences.push(`Your notes around this profile touch on ${topicList.join(", ")}.`);
  }
  if (!profileFacts.length && recentNotes.length) {
    sentences.push(`Recent context: ${recentNotes.join(" ")}`);
  }

  return cleanText(sentences.join(" ").replace(/\s+/g, " "), 2000);
}

function compactNote(value, maxLength = 1800) {
  return cleanText(value, maxLength).replace(/\n{3,}/g, "\n\n");
}

function validateAiOverview(overview) {
  const lower = cleanText(overview, 2200).toLowerCase();
  const forbiddenPhrases = [
    "your notes touch on",
    "your notes around this profile",
    "this profile",
    "memory cards",
    "database",
    "tags",
  ];
  if (forbiddenPhrases.some((phrase) => lower.includes(phrase))) {
    const error = new Error("AI overview refresh returned a low-quality summary. Try again.");
    error.statusCode = 502;
    throw error;
  }
}

function profileContextForAi(person, interactions, memoryCards, reminders) {
  const profileFacts = extractProfileFacts(person, interactions, memoryCards);
  return {
    person: {
      name: person?.name || "",
      preferredName: person?.preferred_name || "",
      email: person?.email || "",
      phone: person?.phone || "",
      firstMetAt: person?.first_met_at || "",
      firstMetLocation: person?.first_met_location || "",
      tags: Array.isArray(person?.tags) ? person.tags : [],
      existingOverview: person?.overview || "",
      metadata: person?.metadata && typeof person.metadata === "object" ? person.metadata : {},
    },
    profileFacts,
    memoryCards: memoryCards
      .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
      .slice(0, 80)
      .map((card) => ({
        category: card.category || "",
        label: card.label || "",
        value: card.value || "",
        confidence: card.confidence || null,
        updatedAt: card.updated_at || "",
        metadata: card.metadata && typeof card.metadata === "object" ? card.metadata : {},
      })),
    conversations: interactions
      .slice(0, 40)
      .map((interaction) => ({
        occurredAt: interaction.occurred_at || "",
        location: interaction.location || "",
        mood: interaction.mood || "",
        topics: Array.isArray(interaction.topics) ? interaction.topics : [],
        summary: interaction.ai_summary || "",
        notes: compactNote(interaction.notes || ""),
        source: interaction.source || "",
        metadata: interaction.metadata && typeof interaction.metadata === "object" ? interaction.metadata : {},
      })),
    reminders: reminders
      .slice(0, 20)
      .map((reminder) => ({
        title: reminder.title || "",
        details: reminder.details || "",
        remindAt: reminder.remind_at || "",
        status: reminder.status || "",
        priority: reminder.priority || "",
        metadata: reminder.metadata && typeof reminder.metadata === "object" ? reminder.metadata : {},
      })),
  };
}

async function buildAiProfileOverview(person, interactions, memoryCards, reminders, fallbackOverview) {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("AI overview refresh is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const context = profileContextForAi(person, interactions, memoryCards, reminders);
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.25,
      max_tokens: OVERVIEW_MAX_TOKENS,
      reasoning_effort: REASONING_EFFORT,
      reasoning_format: "hidden",
      messages: [
        {
          role: "system",
          content:
            "You write private People Notebook overviews for Quentin. Use all provided context for this single profile, including conversations that do not repeat the person's name. Produce a natural, useful profile summary, not a topic list. Start with who this person is in relation to Quentin or how he knows them when the context supports it. Then synthesize stable traits, life context, values, preferences, routines, and relationship dynamics that would help Quentin understand and care for this person. Treat reminders, dated logistics, temporary health/dental updates, and one-time plans as recent context, not permanent identity, unless repeated. Do not say 'your notes touch on', 'this profile', 'tags', 'memory cards', 'database', or mention the process. Do not invent facts. Write 2-4 concise sentences.",
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

  if (!response.ok) {
    const error = new Error(response.status === 429
      ? "AI overview refresh is rate limited. Wait a moment and try again."
      : "AI overview refresh failed. Try again shortly.");
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  const overview = cleanText(payload?.choices?.[0]?.message?.content || "", 2000)
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
  if (!overview) {
    const error = new Error("AI overview refresh returned an empty overview.");
    error.statusCode = 502;
    throw error;
  }
  validateAiOverview(overview);
  return overview;
}

async function rebuildPersonOverview(supabaseRest, personId, options = {}) {
  const encodedPersonId = encodeURIComponent(personId);
  const [people, interactions, loadedMemoryCards, reminders] = await Promise.all([
    loadRows(
      supabaseRest,
      `people?select=id,owner_id,name,preferred_name,email,phone,first_met_at,first_met_location,tags,overview,metadata&limit=1&id=eq.${encodedPersonId}`,
      "Unable to load person."
    ),
    loadRows(
      supabaseRest,
      `person_interactions?select=id,notes,location,mood,topics,ai_summary,source,metadata,occurred_at&person_id=eq.${encodedPersonId}&order=occurred_at.desc&limit=40`,
      "Unable to load interactions."
    ),
    loadRows(
      supabaseRest,
      `person_memory_cards?select=id,category,label,value,confidence,metadata,updated_at&person_id=eq.${encodedPersonId}&order=updated_at.desc&limit=80`,
      "Unable to load memory cards."
    ),
    loadRows(
      supabaseRest,
      `person_follow_up_reminders?select=id,title,details,remind_at,status,priority,metadata,created_at&person_id=eq.${encodedPersonId}&order=created_at.desc&limit=30`,
      "Unable to load reminders."
    ),
  ]);
  if (!people[0]) {
    const error = new Error("Person not found.");
    error.statusCode = 404;
    throw error;
  }

  let memoryCards = loadedMemoryCards;
  if (options.backfillMemoryCards) {
    memoryCards = await backfillMemoryCardsFromFacts(supabaseRest, people[0], interactions, loadedMemoryCards);
  }
  const fallbackOverview = buildProfileOverview(people[0], interactions, memoryCards);
  let overview = fallbackOverview;
  let overviewError = "";
  if (options.useAi) {
    try {
      overview = await buildAiProfileOverview(people[0], interactions, memoryCards, reminders, fallbackOverview);
    } catch (error) {
      overviewError = error?.message || "AI overview refresh failed.";
      if (options.requireAi) throw error;
    }
  }
  if (!overview) return "";
  const response = await supabaseRest(`people?id=eq.${encodedPersonId}&select=id,overview`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: { overview },
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to update profile overview.");
    error.statusCode = response.status;
    throw error;
  }
  if (!Array.isArray(payload) || !payload[0]) {
    const error = new Error("Unable to update profile overview.");
    error.statusCode = 404;
    throw error;
  }
  if (options.returnDetails) {
    return {
      overview,
      overviewError,
      overviewSource: options.useAi && !overviewError ? "ai" : "fallback",
      usedFallback: Boolean(overviewError),
      person: payload[0],
    };
  }
  return overview;
}

module.exports = {
  rebuildPersonOverview,
};
