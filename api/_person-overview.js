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

function buildNoDurableFactsOverview(person, interactions) {
  const name = cleanText(person?.name, 160) || "This profile";
  const count = Array.isArray(interactions) ? interactions.length : 0;
  if (count) {
    return `${name} has ${count} saved conversation${count === 1 ? "" : "s"}, but no durable overview facts have been saved yet.`;
  }
  return `${name} has no durable overview facts saved yet.`;
}

function factSentence(value) {
  const sentence = cleanText(value, 500)
    .replace(/\s+/g, " ")
    .replace(/\bis my\b/gi, "is your")
    .replace(/\bmy\b/gi, "your");
  if (!sentence) return "";
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function buildGroundedOverviewFromFacts(context) {
  const facts = Array.isArray(context?.allowedOverviewFacts) ? context.allowedOverviewFacts : [];
  const seen = new Set();
  const uniqueSentence = (sentence) => {
    const key = cleanText(sentence, 500).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) return "";
    seen.add(key);
    return sentence;
  };
  const durableFacts = facts
    .filter((fact) => fact.sourceType !== "follow_up")
    .map((fact) => factSentence(fact.value))
    .map(uniqueSentence)
    .filter(Boolean);
  const followUps = facts
    .filter((fact) => fact.sourceType === "follow_up")
    .map((fact) => factSentence(fact.value))
    .map(uniqueSentence)
    .filter(Boolean);
  const sentences = [...durableFacts, ...followUps].slice(0, 3);
  if (sentences.length) return cleanText(sentences.join(" "), 1200);
  return "";
}

function compactNote(value, maxLength = 1800) {
  return cleanText(value, maxLength).replace(/\n{3,}/g, "\n\n");
}

function overviewFact(label, value, source = {}) {
  const cleanLabel = cleanText(label, 120);
  const cleanValue = cleanText(value, 700);
  if (!cleanLabel || !cleanValue) return null;
  return {
    label: cleanLabel,
    value: cleanValue,
    sourceType: source.sourceType || "",
    sourceId: source.sourceId || "",
    sourceDate: source.sourceDate || "",
    temporalGuidance: source.temporalGuidance || "",
  };
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

function validateAiOverview(overview, context = {}) {
  const lower = cleanText(overview, 2200).toLowerCase();
  const forbiddenPhrases = [
    "your notes touch on",
    "your notes around this profile",
    "this profile",
    "memory cards",
    "database",
    "tags",
    "warm-hearted",
    "family-centered",
    "appears to",
    "seems to",
    "shows she values",
    "shows he values",
    "shows they value",
    "shows she",
    "shows he",
    "shows they",
    "values shared",
    "values ",
    "appreciates",
    "enjoys ",
    "likes joining",
    "prefers calm",
    "enjoyment of",
    "appears",
    "seems",
    "likely",
  ];
  if (forbiddenPhrases.some((phrase) => lower.includes(phrase))) {
    const error = new Error("AI overview refresh returned a low-quality summary. Try again.");
    error.statusCode = 502;
    throw error;
  }
  const allowedText = [
    context.person?.name || "",
    context.person?.preferredName || "",
    context.person?.firstMetLocation || "",
    ...(Array.isArray(context.allowedOverviewFacts)
      ? context.allowedOverviewFacts.flatMap((fact) => [fact.label, fact.value])
      : []),
  ].join(" ");
  const allowedLower = allowedText.toLowerCase();
  const ignoredNames = new Set([
    "Quentin",
    "People Notebook",
    "He",
    "She",
    "They",
    "This",
    "That",
    "The",
    "A",
    "An",
    "On",
    "In",
    "As",
    "During",
    "Since",
    "Today",
    "Yesterday",
    "Tomorrow",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]);
  const names = cleanText(overview, 2200).match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  const unsupportedName = names.find((name) => !ignoredNames.has(name) && !allowedLower.includes(name.toLowerCase()));
  if (unsupportedName) {
    const error = new Error(`AI overview mentioned unsupported detail: ${unsupportedName}. Try again.`);
    error.statusCode = 502;
    throw error;
  }
}

function profileContextForAi(person, interactions, memoryCards, reminders) {
  const profileFacts = extractProfileFacts(person, interactions, memoryCards);
  const now = new Date();
  const interactionDates = new Map(interactions.map((interaction) => [interaction.id, interaction.occurred_at || ""]));
  const allowedOverviewFacts = [
    ...profileFacts.map((fact) => overviewFact("Profile fact", fact, { sourceType: "derived_profile_fact" })),
    ...memoryCards
      .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
      .slice(0, 80)
      .map((card) => overviewFact(card.label || "Memory", card.value || "", {
        sourceType: "memory_card",
        sourceId: card.id || "",
        sourceDate: interactionDates.get(card.source_interaction_id) || card.updated_at || "",
        temporalGuidance: temporalGuidance(`${card.label || ""} ${card.value || ""}`, interactionDates.get(card.source_interaction_id) || card.updated_at, now),
      })),
    ...reminders
      .filter((reminder) => reminder.status === "open")
      .filter((reminder) => {
        const dueAge = ageMeta(reminder.remind_at || reminder.created_at, now);
        return dueAge.ageDays === null || dueAge.ageDays <= 7;
      })
      .slice(0, 12)
      .map((reminder) => overviewFact("Open follow-up", [reminder.title, reminder.details].filter(Boolean).join(" - "), {
        sourceType: "follow_up",
        sourceId: reminder.id || "",
        sourceDate: reminder.remind_at || reminder.created_at || "",
        temporalGuidance: temporalGuidance(`${reminder.title || ""} ${reminder.details || ""}`, reminder.remind_at || reminder.created_at, now),
      })),
  ].filter(Boolean);
  return {
    generatedAt: now.toISOString(),
    allowedOverviewFacts,
    temporalRules: [
      "Every conversation has occurredAt, ageDays, and recency. Use those fields to decide currentness.",
      "Do not convert old temporary notes into present-tense facts.",
      "Medical, dental, visit, appointment, recovery, travel, and 'currently/right now/through Saturday' notes expire unless they are recent, repeated, or backed by an open reminder.",
      "Durable facts are relationships, long-term preferences, repeated routines, values, stable work/family context, and recurring patterns.",
    ],
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
    memoryCards: memoryCards
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
    conversations: interactions
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
    reminders: reminders
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

async function buildAiProfileOverview(person, interactions, memoryCards, reminders, fallbackOverview) {
  const context = profileContextForAi(person, interactions, memoryCards, reminders);
  if (!context.allowedOverviewFacts.length) {
    return buildNoDurableFactsOverview(person, interactions);
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("AI overview refresh is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const systemPrompt = "You write private People Notebook overviews for Quentin using evidence only. Do not write a narrative, personality sketch, or motivational interpretation. Build the overview only from allowedOverviewFacts and explicit profile fields. Raw conversations are only for resolving dates, pronouns, and currentness; do not introduce new overview facts from raw notes unless the same fact appears in allowedOverviewFacts. Do not infer traits, values, emotions, preferences, motives, or relationship dynamics from activities unless that exact idea is stored as an allowed fact. Avoid adjectives such as warm, family-centered, caring, active, supportive, calm, thoughtful, or similar unless they are explicitly stored. Start with the strongest durable fact, usually the person's relationship to Quentin or stable role. Then include only stable or clearly dated facts. You must reason carefully from generatedAt, occurredAt, ageDays, recency, dueAge, and temporalGuidance. Do not describe old temporary logistics as current. Medical, dental, appointment, recovery, visit/travel, and 'currently/right now/through Saturday' details are temporary unless they are recent, repeated in newer conversations, or backed by an open non-stale reminder. For old temporary details, either omit them or phrase them historically with the concrete date. Do not say 'your notes touch on', 'this profile', 'tags', 'memory cards', 'database', or mention the process. Do not invent facts. Write 1-3 concise evidence-grounded sentences.";
  const requestOverview = async (messages) => {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.05,
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
    const overview = cleanText(payload?.choices?.[0]?.message?.content || "", 2000)
      .replace(/^["']|["']$/g, "")
      .replace(/\s+/g, " ");
    if (!overview) {
      const error = new Error("AI overview refresh returned an empty overview.");
      error.statusCode = 502;
      throw error;
    }
    return overview;
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
  let overview = "";
  try {
    overview = await requestOverview(baseMessages);
    validateAiOverview(overview, context);
    return overview;
  } catch (error) {
    if (error?.statusCode !== 502) throw error;
    let retryOverview = "";
    try {
      retryOverview = await requestOverview([
      ...baseMessages,
      { role: "assistant", content: overview },
      {
        role: "user",
        content: `That overview failed validation: ${error.message} Rewrite it using only allowedOverviewFacts and explicit profile fields. Do not add names, places, events, traits, or interpretations that are not present in allowedOverviewFacts.`,
      },
      ]);
      validateAiOverview(retryOverview, context);
      return retryOverview;
    } catch {
      const groundedOverview = buildGroundedOverviewFromFacts(context);
      if (groundedOverview) return groundedOverview;
      throw error;
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
