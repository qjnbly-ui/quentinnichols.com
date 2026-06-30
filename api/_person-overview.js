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
  const value = cleanText(card?.value, 400).toLowerCase();
  return ["upcoming event", "visit context", "appointment", "reminder", "dental work", "medical update"].includes(label)
    || /\b(currently|right now|today|tomorrow|this week|through saturday|staying with|expected to|upcoming|appointment|surgery|procedure|dental|teeth|crowns?|bridge|implants?|recovering)\b/i.test(value);
}

function overviewTags(tags) {
  const ignored = new Set(["captured", "capture", "imported", "new", "profile"]);
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => cleanText(tag, 48))
    .filter(Boolean)
    .filter((tag) => !ignored.has(tag.toLowerCase()));
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
    } else if (label.includes("family") && /\bgrandma|grandmother\b/i.test(value)) {
      addFact(`${name} is your grandma.`);
    } else if (label.includes("family") && /\bgrandpa|grandfather\b/i.test(value)) {
      addFact(`${name} is your grandpa.`);
    } else if (label.includes("family") && /\bmom|mother\b/i.test(value)) {
      addFact(`${name} is your mom.`);
    } else if (label.includes("family") && /\bdad|father\b/i.test(value)) {
      addFact(`${name} is your dad.`);
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
      { pattern: new RegExp(`\\bmy\\s+(?:grandma|grandmother)\\s+(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "grandma" },
      { pattern: new RegExp(`\\bmy\\s+(?:grandpa|grandfather)\\s+(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "grandpa" },
      { pattern: new RegExp(`\\bmy\\s+(?:mom|mother)\\s+(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "mom" },
      { pattern: new RegExp(`\\bmy\\s+(?:dad|father)\\s+(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "dad" },
      { pattern: new RegExp(`\\bmy\\s+(?:(?:younger|older)\\s+)?cousin\\s+(${escapedName}|[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)\\b`, "i"), relation: "cousin" },
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
  const tags = overviewTags(person?.tags);
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
  if (person?.first_met_location) identityBits.push(`connected to you through ${cleanText(person.first_met_location, 160)}`);

  const sentences = [];
  if (profileFacts.length) {
    sentences.push(profileFacts.join(" "));
  } else {
    sentences.push(identityBits.length ? `${name} ${identityBits.join(" and ")}.` : `${name} is someone in your People Notebook.`);
  }
  if (topMemories.length) {
    sentences.push(`Saved context: ${topMemories.join("; ")}.`);
  }
  if (recentNotes.length) {
    sentences.push(`Recent context: ${recentNotes.join(" ")}`);
  }
  if (!topMemories.length && !recentNotes.length && topicList.length) {
    sentences.push(`Conversation topics include ${topicList.join(", ")}.`);
  }

  return cleanText(sentences.join(" ").replace(/\s+/g, " "), 2000);
}

function countWords(value) {
  return (String(value || "").match(/\b[\w'-]+\b/g) || []).length;
}

function evidenceWordCount(context = {}) {
  const conversationWords = Array.isArray(context.recentConversations)
    ? context.recentConversations.reduce((total, conversation) => total + countWords(`${conversation.summary || ""} ${conversation.notes || ""}`), 0)
    : 0;
  const memoryWords = Array.isArray(context.durableMemories)
    ? context.durableMemories.reduce((total, card) => total + countWords(`${card.label || ""} ${card.value || ""}`), 0)
    : 0;
  return conversationWords + memoryWords;
}

function compactNote(value, maxLength = 1800) {
  return cleanText(value, maxLength).replace(/\n{3,}/g, "\n\n");
}

function ageMeta(value, now = new Date()) {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) {
    return { iso: "", ageDays: null, recency: "unknown date" };
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  const absDays = Math.abs(diffDays);
  const recency = diffDays < 0
    ? `future by ${absDays} day${absDays === 1 ? "" : "s"}`
    : diffDays === 0 ? "today"
    : diffDays === 1 ? "yesterday"
    : `${diffDays} days ago`;
  return { iso: date.toISOString(), ageDays: diffDays, recency };
}

function hasTemporarySignal(value) {
  return /\b(currently|right now|today|tomorrow|tonight|this week|this weekend|through\s+\w+|staying with|expected to|plans? to|going to|upcoming|later|appointment|surgery|procedure|dental|teeth|crowns?|bridge|implants?|recovering|recovery|visiting|visit|temporary)\b/i.test(String(value || ""));
}

function temporalGuidance(text, dateValue, now = new Date()) {
  const age = ageMeta(dateValue, now);
  const temporary = hasTemporarySignal(text);
  if (age.ageDays === null) {
    return temporary
      ? "Temporary-sounding item with unknown date; do not describe as current unless confirmed elsewhere."
      : "Undated item; treat as lower confidence than dated recent evidence.";
  }
  if (temporary && age.ageDays > 7) {
    return `Historical temporary context from ${age.recency}; do not describe as current. Say it happened/was noted then, or omit from overview unless still supported by an open current reminder.`;
  }
  if (temporary && age.ageDays > 2) {
    return `Dated temporary context from ${age.recency}; avoid saying it is current unless repeated in newer notes.`;
  }
  if (temporary) {
    return `Recent temporary context from ${age.recency}; may be current but phrase with date-aware caution.`;
  }
  if (age.ageDays > 30) {
    return `Older durable context from ${age.recency}; use only for stable traits, relationships, or repeated patterns.`;
  }
  return `Dated context from ${age.recency}.`;
}

function normalizeGeneratedOverview(value) {
  return cleanText(value, 2000)
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ");
}

function validateGeneratedOverview(overview, context = {}) {
  const cleanOverview = normalizeGeneratedOverview(overview);
  if (!cleanOverview) {
    const error = new Error("empty overview");
    error.statusCode = 502;
    throw error;
  }
  const lower = cleanOverview.toLowerCase();
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
  if (evidenceWordCount(context) >= 180 && countWords(cleanOverview) < 45) {
    const error = new Error("overview was too thin");
    error.statusCode = 502;
    throw error;
  }
  return cleanOverview;
}

function profileContextForAi(person, interactions, memoryCards, reminders) {
  const profileFacts = extractProfileFacts(person, interactions, memoryCards);
  const now = new Date();
  const interactionDates = new Map(interactions.map((interaction) => [interaction.id, interaction.occurred_at || ""]));
  return {
    generatedAt: now.toISOString(),
    person: {
      name: person?.name || "",
      preferredName: person?.preferred_name || "",
      email: person?.email || "",
      phone: person?.phone || "",
      firstMetAt: person?.first_met_at || "",
      firstMetLocation: person?.first_met_location || "",
      tags: overviewTags(person?.tags),
      existingOverview: person?.overview || "",
      metadata: person?.metadata && typeof person.metadata === "object" ? person.metadata : {},
    },
    profileFacts,
    durableMemories: memoryCards
      .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
      .slice(0, 80)
      .map((card) => ({
        id: card.id || "",
        category: card.category || "",
        label: card.label || "",
        value: card.value || "",
        confidence: card.confidence || null,
        sourceInteractionId: card.source_interaction_id || "",
        sourceOccurredAt: interactionDates.get(card.source_interaction_id) || "",
        sourceAge: ageMeta(interactionDates.get(card.source_interaction_id) || card.updated_at, now),
        temporalGuidance: temporalGuidance(`${card.label || ""} ${card.value || ""}`, interactionDates.get(card.source_interaction_id) || card.updated_at, now),
        updatedAt: card.updated_at || "",
        metadata: card.metadata && typeof card.metadata === "object" ? card.metadata : {},
      })),
    recentConversations: interactions
      .slice(0, 40)
      .map((interaction) => ({
        id: interaction.id || "",
        occurredAt: interaction.occurred_at || "",
        age: ageMeta(interaction.occurred_at, now),
        temporalGuidance: temporalGuidance(`${interaction.ai_summary || ""} ${interaction.notes || ""}`, interaction.occurred_at, now),
        location: interaction.location || "",
        mood: interaction.mood || "",
        topics: Array.isArray(interaction.topics) ? interaction.topics : [],
        summary: interaction.ai_summary || "",
        notes: compactNote(interaction.notes || ""),
        source: interaction.source || "",
        metadata: interaction.metadata && typeof interaction.metadata === "object" ? interaction.metadata : {},
      })),
    openReminders: reminders
      .filter((reminder) => reminder.status === "open")
      .slice(0, 20)
      .map((reminder) => ({
        title: reminder.title || "",
        details: reminder.details || "",
        remindAt: reminder.remind_at || "",
        dueAge: ageMeta(reminder.remind_at, now),
        temporalGuidance: reminder.status === "open"
          ? temporalGuidance(`${reminder.title || ""} ${reminder.details || ""}`, reminder.remind_at || reminder.created_at, now)
          : "Closed reminder; use only as historical context.",
        status: reminder.status || "",
        priority: reminder.priority || "",
        metadata: reminder.metadata && typeof reminder.metadata === "object" ? reminder.metadata : {},
      })),
  };
}

function hasProfileEvidence(context) {
  return Boolean(
    context.profileFacts?.length
    || context.durableMemories?.length
    || context.recentConversations?.length
    || context.openReminders?.length
    || context.person?.firstMetLocation
  );
}

async function buildAiProfileOverview(person, interactions, memoryCards, reminders, fallbackOverview) {
  const context = profileContextForAi(person, interactions, memoryCards, reminders);
  if (!hasProfileEvidence(context)) {
    return { overview: fallbackOverview, source: "fallback", error: "" };
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { overview: fallbackOverview, source: "fallback", error: "AI overview refresh is not configured." };
  }

  const systemPrompt = [
    "You write private People Notebook overviews for Quentin.",
    "Write about the named person, not about the database or the note-taking process.",
    "Use the evidence packet to create a warm, accurate, useful summary Quentin can read before talking to this person.",
    "Use natural synthesis. You may connect repeated facts, preferences, values, routines, hopes, fears, family context, faith, work, health preferences, and relationship dynamics when the evidence supports them.",
    "Do not invent concrete names, places, events, medical facts, relationship status, motives, promises, or future outcomes.",
    "Handle time carefully. Temporary logistics, visits, travel, appointments, medical/dental procedures, and words like currently/tomorrow/this weekend expire unless recent, repeated, or backed by an open reminder.",
    "Prefer stable and repeated context. Use recent temporary details only if they are genuinely helpful and date-aware.",
    "Write 2-4 natural, information-dense sentences. No bullet list. No labels. No mention of tags, memory cards, database, evidence packet, or profile fields.",
  ].join(" ");

  const requestOverview = async (messages) => {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.22,
        max_tokens: OVERVIEW_MAX_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        reasoning_format: "hidden",
        messages,
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
    return validateGeneratedOverview(payload?.choices?.[0]?.message?.content || "", context);
  };

  const baseMessages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: JSON.stringify({
        context,
        currentFallbackOverview: fallbackOverview,
      }),
    },
  ];

  try {
    return { overview: await requestOverview(baseMessages), source: "ai", error: "" };
  } catch (error) {
    const firstError = error?.message || "AI overview refresh failed.";
    try {
      return {
        overview: await requestOverview([
          ...baseMessages,
          {
            role: "user",
            content: "Try again. Write a complete, natural overview from the evidence packet. Keep it grounded, useful, and human. Do not mention the process.",
          },
        ]),
        source: "ai",
        error: "",
      };
    } catch (retryError) {
      return {
        overview: fallbackOverview,
        source: "fallback",
        error: retryError?.message || firstError,
      };
    }
  }
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
      `person_memory_cards?select=id,category,label,value,confidence,source_interaction_id,metadata,updated_at&person_id=eq.${encodedPersonId}&order=updated_at.desc&limit=80`,
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
  let overviewSource = "fallback";
  if (options.useAi) {
    const aiResult = await buildAiProfileOverview(people[0], interactions, memoryCards, reminders, fallbackOverview);
    overview = aiResult.overview || fallbackOverview;
    overviewError = aiResult.error || "";
    overviewSource = aiResult.source || "fallback";
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
      overviewSource,
      usedFallback: overviewSource !== "ai",
      person: payload[0],
    };
  }
  return overview;
}

module.exports = {
  rebuildPersonOverview,
};
