const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");

const MODEL = process.env.RELATIONSHIP_NOTE_MODEL || "openai/gpt-oss-120b";
const REASONING_EFFORT = process.env.RELATIONSHIP_REASONING_EFFORT || "medium";
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const PET_TYPE_PATTERN = "border collie|golden retriever|dog|cat|pet|horse";
const STOPWORDS = new Set([
  "and",
  "about",
  "after",
  "along",
  "before",
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
  "my",
  "you",
  "known",
  "thankfully",
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
  "her",
  "him",
  "his",
]);
const RELATION_WORDS = new Set([
  "dad",
  "daughter",
  "father",
  "husband",
  "kid",
  "mom",
  "mother",
  "sister",
  "son",
  "spouse",
  "wife",
]);

const DRAFT_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "relationship_note_draft",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "people", "possiblePeople", "interaction", "memoryCards", "reminders", "questions"],
      properties: {
        summary: { type: "string" },
        people: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "name", "matchedAlias", "confidence", "selected"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              matchedAlias: { type: "string" },
              confidence: { type: "number" },
              selected: { type: "boolean" },
            },
          },
        },
        possiblePeople: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "confidence"],
            properties: {
              name: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
        interaction: {
          type: "object",
          additionalProperties: false,
          required: ["location", "mood", "topics", "dateHint", "notes"],
          properties: {
            location: { type: "string" },
            mood: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
            dateHint: { type: "string" },
            notes: { type: "string" },
          },
        },
        memoryCards: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["label", "value", "confidence"],
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
        reminders: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "details", "confidence"],
            properties: {
              title: { type: "string" },
              details: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
        questions: { type: "array", items: { type: "string" } },
      },
    },
  },
};

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

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function noteIncludesName(note, name) {
  return new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(note);
}

function isValidPersonName(name, note = "") {
  const cleanName = cleanText(name, 120);
  if (!cleanName || cleanName.includes("'")) return false;
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (!parts.length || parts.length > 3) return false;
  const lowerParts = parts.map((part) => part.toLowerCase());
  if (lowerParts.some((part) => STOPWORDS.has(part))) return false;
  if (lowerParts.every((part) => RELATION_WORDS.has(part))) return false;
  if (/^(my|their|our|his|her)\b/i.test(cleanName)) return false;
  if (/\b(?:dad|father|mom|mother|kid|child)\b/i.test(cleanName) && !noteIncludesName(note, cleanName)) return false;
  if (cleanName.toLowerCase() === "quentin nichols") return false;
  return true;
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
  const aliasNames = new Set(extractAliasNames(note).map((name) => name.toLowerCase()));
  const explicitMatches = [];
  const explicitPatterns = [
    /\b(?:met|saw|visited with|talked to|spoke with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=\s+(?:at|after|today|yesterday|and|about|because)\b|[.,!?]|$)/gi,
    /\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=\s+(?:at|after|today|yesterday|and|about|because)\b|[.,!?]|$)/gi,
    /\b(?:mom|mother|dad|father|sister|brother|wife|husband|spouse|daughter|son)\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?=[.,!?]|$|\s+(?:known|came|is|was|has|and)\b)/gi,
    /\b(?:before|after)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:came|joined|entered)\b/gi,
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
    .filter((name) => !aliasNames.has(name.toLowerCase()))
    .filter((name) => isValidPersonName(name, note))
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
  const exactWeekday = note.match(new RegExp(`\\b(?:next|this|last)\\s+(${WEEKDAYS.join("|")})\\b`, "i"));
  if (exactWeekday) return exactWeekday[0];
  const futureRelative = ["this weekend", "next month", "next week", "tomorrow", "tonight"].find((term) => lowerNote.includes(term));
  if (futureRelative) return futureRelative;
  const weekday = WEEKDAYS.find((day) => new RegExp(`\\b${day}\\b`, "i").test(lowerNote));
  if (weekday) return weekday;
  const relative = ["today"].find((term) => lowerNote.includes(term));
  if (relative) return relative;
  const dateMatch = note.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i);
  return dateMatch?.[0] || "";
}

function sentenceForName(note, name) {
  const escapedName = escapeRegExp(name);
  return note.split(/(?<=[.!?])\s+/).find((sentence) => new RegExp(`\\b${escapedName}\\b`, "i").test(sentence)) || "";
}

function extractPetNames(note) {
  const names = [];
  const patterns = [
    new RegExp(`\\b(?:his|her|their|my)\\s+(?:${PET_TYPE_PATTERN})\\s+([A-Z][a-z]+)\\b`, "gi"),
    new RegExp(`\\b(?:${PET_TYPE_PATTERN})\\s+(?:named|called)\\s+([A-Z][a-z]+)\\b`, "gi"),
    new RegExp(`\\b([A-Z][a-z]+)\\s+(?:the\\s+)?(?:${PET_TYPE_PATTERN})\\b`, "gi"),
  ];
  patterns.forEach((pattern) => {
    for (const match of note.matchAll(pattern)) {
      names.push(match[1]);
    }
  });
  return uniqueList(names, 6).filter((name) => !["her", "his", "their", "my"].includes(name.toLowerCase()));
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

function extractAliasNames(note) {
  const names = [];
  const patterns = [
    /\bKnown as\s+([A-Z][a-z]+)\b/gi,
    /\bgoes by\s+([A-Z][a-z]+)\b/gi,
  ];
  patterns.forEach((pattern) => {
    for (const match of note.matchAll(pattern)) {
      names.push(match[1]);
    }
  });
  return uniqueList(names, 6);
}

function extractRelationshipOnlyNames(note) {
  const names = [];
  const patterns = [
    /\b(?:his|her|their)\s+(?:daughter|son|kid|child|wife|husband|spouse|mom|mother|dad|father)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /\b(?:daughter|son|kid|child|wife|husband|spouse)\s+([A-Z][a-z]+)(?=\s+(?:has|had|is|was|will|starts|plays|goes|needs|wants)\b|[.,!?]|$)/gi,
  ];
  patterns.forEach((pattern) => {
    for (const match of note.matchAll(pattern)) {
      names.push(match[1]);
    }
  });
  return uniqueList(names, 8);
}

function isDirectInteractionName(note, name) {
  const escapedName = escapeRegExp(name);
  return new RegExp(`\\b(?:met|saw|visited with|talked to|spoke with|had coffee with|had lunch with)\\s+(?:[^.!?]*\\b)?${escapedName}\\b`, "i").test(note);
}

function extractMemoryCards(note) {
  const cards = [];
  const knownAs = note.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\.\s+Known as\s+([A-Z][a-z]+)\b/i)
    || note.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is\s+)?(?:known as|goes by)\s+([A-Z][a-z]+)\b/i);
  if (knownAs) {
    cards.push({ label: "Preferred Name", value: `${titleCase(knownAs[1])}: ${titleCase(knownAs[2])}`, confidence: 0.9 });
  }
  const familyContext = [];
  const cousinContext = note.match(/\bmy\s+cousin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (cousinContext) familyContext.push(`${titleCase(cousinContext[1])} is my cousin`);
  const mom = note.match(/\bmy\s+(?:mom|mother)\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (mom) familyContext.push(`${titleCase(mom[1])} is my mom`);
  const sister = note.match(/\bmy\s+(?:younger\s+)?sister\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (sister) familyContext.push(`${titleCase(sister[1])} is my${/\byounger sister\b/i.test(note) ? " younger" : ""} sister`);
  const cameIntoLives = note.match(/\bbefore\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+came into our lives\b/i);
  if (cameIntoLives) familyContext.push(`${titleCase(cameIntoLives[1])} came into our lives`);
  if (familyContext.length) {
    cards.push({ label: "Family Context", value: familyContext.join("; "), confidence: 0.84 });
  }
  const daughter = note.match(/\b(?:daughter|kid|son|wife|husband|spouse|mom|dad|mother|father)\s+([A-Z][a-z]+)\b/);
  if (daughter) {
    cards.push({ label: titleCase(daughter[0].replace(daughter[1], "").trim()), value: daughter[1], confidence: 0.72 });
  }
  const graduation = note.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:just\s+)?graduated\s+([^.!?]+)/i)
    || note.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:just\s+)?graduated\b/i);
  if (graduation) {
    const detail = cleanText(graduation[2] || "graduated", 160);
    cards.push({ label: "School Milestone", value: `${titleCase(graduation[1])} graduated ${detail}`.replace(/\s+/g, " "), confidence: 0.86 });
  }
  const dating = note.match(/\b(?:I\s+)?dated\s+(?:this\s+girl\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)(?:\s+when\s+I\s+was\s+in\s+([^.!?]+?))?(?:[,.]|$)/i);
  if (dating) {
    const timing = dating[2] ? ` when you were in ${cleanText(dating[2], 80)}` : "";
    cards.push({ label: "Past Relationship", value: `You dated ${titleCase(dating[1])}${timing}`, confidence: 0.78 });
  }
  const petNames = extractPetNames(note);
  petNames.forEach((name) => {
    const petType = note.match(new RegExp(`\\b(?:his|her|their|my)\\s+(${PET_TYPE_PATTERN})\\s+${name}\\b`, "i"))?.[1]
      || note.match(new RegExp(`\\b(${PET_TYPE_PATTERN})\\s+(?:named\\s+)?${name}\\b`, "i"))?.[1]
      || note.match(new RegExp(`\\b${name}\\s+(?:the\\s+)?(${PET_TYPE_PATTERN})\\b`, "i"))?.[1]
      || "Pet";
    cards.push({ label: titleCase(petType), value: name, confidence: 0.88 });
  });
  const work = note.match(/\b(?:runs|owns|operates|manages|works at|works for)\s+([^.!?]+)/i);
  if (work) {
    const workValue = work[1].split(/\s+and\s+(?:is|was|has|will|asked|mentioned|said)\b/i)[0];
    cards.push({ label: "Work", value: cleanText(workValue, 180), confidence: 0.76 });
  }
  const event = note.match(/\b(?:preparing for|getting ready for|going to|attending|hosting|organizing|helping organize)\s+(?:an?\s+)?([^.!?]+?\b(?:market|booth|show|event|conference|wedding|graduation|dinner|fundraiser|breakfast)\b[^.!?]*)/i)
    || note.match(/\b(?:preparing|making|bringing|cooking)\s+(?:food|dessert|meal|meals|catering)?\s*for\s+(?:an?\s+)?([^.!?]+?\b(?:market|booth|show|event|conference|wedding|graduation|dinner|fundraiser|breakfast)\b[^.!?]*)/i);
  if (event) {
    cards.push({ label: "Upcoming Event", value: cleanText(event[1], 180), confidence: 0.78 });
  }
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

function normalizeCard(card) {
  const label = cleanText(card.label, 120);
  let value = cleanText(card.value, 1000);
  if (!label || !value) return null;
  const lowerLabel = label.toLowerCase();
  const lowerValue = value.toLowerCase();
  if (lowerLabel === "place") return null;
  if (["pet", "pets", "dog", "cat", "horse", "border collie", "golden retriever"].includes(lowerLabel) && ["her", "his", "their", "my"].includes(lowerValue)) {
    return null;
  }

  let normalizedLabel = titleCase(label);
  value = value.replace(/^(?:a|an|the)\s+/i, "");
  const petValue = value.match(/^([A-Z][a-z]+)\s*,\s*(.+)$/);
  if (["pet", "pets"].includes(lowerLabel) && petValue) {
    value = petValue[1];
    normalizedLabel = titleCase(petValue[2]);
  }
  const petDescriptiveValue = value.match(new RegExp(`^([A-Z][a-z]+)\\s+(?:the\\s+)?(${PET_TYPE_PATTERN})\\b`, "i"));
  if (["pet", "pets"].includes(lowerLabel) && petDescriptiveValue) {
    value = titleCase(petDescriptiveValue[1]);
    normalizedLabel = titleCase(petDescriptiveValue[2]);
  }
  if (["event", "events"].includes(lowerLabel)) {
    normalizedLabel = "Upcoming Event";
  }

  return {
    ...card,
    label: normalizedLabel,
    value,
    confidence: Number.isFinite(Number(card.confidence)) ? Number(card.confidence) : 0.7,
  };
}

function normalizedCardKey(card) {
  const label = cleanText(card.label, 120).toLowerCase();
  const value = cleanText(card.value, 1000).toLowerCase();
  const compactValue = value
    .replace(new RegExp(`\\b(next|this|last)\\s+(month|week|year|${WEEKDAYS.join("|")})\\b`, "gi"), "")
    .replace(/\b(before|after)\s+\w+\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(?:a|an|the)\s+/, "");

  if (["pet", "pets", "dog", "cat", "border collie", "golden retriever", "horse"].includes(label)) {
    return `pet:${compactValue.split(/\s+/)[0] || compactValue}`;
  }
  if (label.includes("trip") || label.includes("travel") || value.includes("glacier national park")) {
    return `trip:${compactValue}`;
  }
  if (label.includes("hobby")) {
    return `hobby:${compactValue}`;
  }
  if (label.includes("work")) {
    return `work:${compactValue}`;
  }
  if (label.includes("event") || value.includes("art market")) {
    return `event:${compactValue}`;
  }
  return `${label}:${compactValue}`;
}

function cardScore(card) {
  const label = cleanText(card.label, 120).toLowerCase();
  const value = cleanText(card.value, 1000).toLowerCase();
  let score = Number(card.confidence) || 0;
  if (label !== "pet") score += 0.2;
  if (new RegExp(`\\b(next|this|last)\\s+(month|week|year|${WEEKDAYS.join("|")})\\b`, "i").test(value)) score += 0.2;
  if (label.includes("event") || label.includes("work")) score += 0.2;
  if (label === "border collie") score += 0.2;
  if (label === "golden retriever") score += 0.2;
  if (label === "cat") score += 0.2;
  return score;
}

function mergeCards(primaryCards, fallbackCards) {
  const cardsByKey = new Map();
  [...primaryCards, ...fallbackCards]
    .map(normalizeCard)
    .filter(Boolean)
    .forEach((card) => {
      const key = normalizedCardKey(card);
      const existing = cardsByKey.get(key);
      if (!existing || cardScore(card) > cardScore(existing)) {
        cardsByKey.set(key, card);
      }
    });
  return [...cardsByKey.values()].slice(0, 8);
}

function normalizedReminderKey(reminder) {
  const title = cleanText(reminder.title, 220).toLowerCase().replace(/[’]/g, "'");
  const adjustmentMatch = title.match(/\b(?:ask\s+how|ask\s+about)\s+([a-z]+)(?:'s)?\s+(?:is\s+adjusting|adjustment)\b/);
  if (adjustmentMatch) {
    return `${adjustmentMatch[1]}:adjusting`;
  }
  const appointmentMatch = title.match(/\b(?:ask\s+about|check\s+whether)\s+([a-z]+)(?:'s)?\s+appointment\b/);
  if (appointmentMatch) {
    return `${appointmentMatch[1]}:appointment`;
  }
  const specificMatch = title.match(/\b(?:ask|check|whether)\s+(?:how\s+)?([a-z]+)(?:['’]s)?\s+(.+?)(?:\s+went|\s+is\s+adjusting|$)/);
  if (specificMatch) {
    return `${specificMatch[1]}:${specificMatch[2].replace(/[^a-z0-9]+/g, " ").trim()}`;
  }
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(ask|check|follow|up|back|about|the|a|an)\b/g, " ")
    .trim();
}

function splitReminder(reminder) {
  const title = cleanText(reminder.title, 220);
  const details = cleanText(reminder.details, 260);
  const confidence = Number.isFinite(Number(reminder.confidence)) ? Number(reminder.confidence) : 0.7;
  const cleanTitle = title.replace(/[’]/g, "'");
  const combined = cleanTitle.match(/\bask\s+how\s+([A-Z][a-z]+)\s+is\s+adjusting\s+and\s+check\s+whether\s+([A-Z][a-z]+)'s\s+appointment(?:\s+went\s+okay)?\b/i)
    || cleanTitle.match(/\bask\s+about\s+([A-Z][a-z]+)'s\s+is\s+adjusting\s+and\s+check\s+whether\s+([A-Z][a-z]+)'s\s+appointment(?:\s+went\s+okay)?\b/i);
  if (combined) {
    return [
      {
        title: `Ask how ${titleCase(combined[1])} is adjusting`,
        details,
        confidence: Math.max(confidence, 0.78),
      },
      {
        title: `Check whether ${titleCase(combined[2])}'s appointment went okay`,
        details,
        confidence: Math.max(confidence, 0.78),
      },
    ];
  }
  const looseCombined = cleanTitle.match(/\bask\s+(?:how\s+)?([A-Z][a-z]+)(?:'s)?\s+(.+?)\s+and\s+check\s+(?:whether\s+)?([A-Z][a-z]+)(?:'s)?\s+(.+)/i);
  if (!looseCombined) return [reminder];
  return [
    {
      title: `Ask about ${titleCase(looseCombined[1])}'s ${cleanText(looseCombined[2], 90).replace(/\s+is\s+adjusting$/i, " adjustment")}`,
      details,
      confidence: Math.max(confidence, 0.78),
    },
    {
      title: `Check whether ${titleCase(looseCombined[3])}'s ${cleanText(looseCombined[4], 90).replace(/\s+went\s+okay$/i, "went okay")}`,
      details,
      confidence: Math.max(confidence, 0.78),
    },
  ];
}

function cleanReminder(reminder) {
  const title = cleanText(reminder.title, 220)
    .replace(/^Back About\b/i, "Check back about")
    .replace(/^Check Recovery\b/i, "Check recovery");
  if (!title) return null;
  return {
    title,
    details: cleanText(reminder.details, 260),
    confidence: Number.isFinite(Number(reminder.confidence)) ? Number(reminder.confidence) : 0.7,
  };
}

function reminderScore(reminder) {
  const title = cleanText(reminder.title, 220).toLowerCase();
  const details = cleanText(reminder.details, 260).toLowerCase();
  let score = Number(reminder.confidence) || 0;
  if (/\b(went okay|went|recovery|adjusting|tournament)\b/.test(title)) score += 0.18;
  if (/\b(vet appointment|surgery|next|this weekend)\b/.test(details)) score += 0.08;
  return score;
}

function mergeReminders(primaryReminders, fallbackReminders) {
  const remindersByKey = new Map();
  [...primaryReminders, ...fallbackReminders]
    .flatMap(splitReminder)
    .map(cleanReminder)
    .filter(Boolean)
    .forEach((reminder) => {
      const key = normalizedReminderKey(reminder);
      const existing = remindersByKey.get(key);
      if (!existing || reminderScore(reminder) > reminderScore(existing)) {
        remindersByKey.set(key, reminder);
      }
    });
  return [...remindersByKey.values()].slice(0, 6);
}

function chooseDateHint(scriptDateHint, draftDateHint) {
  const scriptHint = cleanText(scriptDateHint, 80);
  const draftHint = cleanText(draftDateHint, 80);
  if (!draftHint) return scriptHint;
  if (draftHint.toLowerCase() === "today" && scriptHint && scriptHint.toLowerCase() !== "today") return scriptHint;
  return draftHint;
}

function normalizeDraftPeople(draftPeople, scriptPeople, knownPeople, note) {
  const knownById = new Map(knownPeople.map((person) => [person.id, person]));
  const knownByName = new Map(knownPeople.map((person) => [person.name.toLowerCase(), person]));
  const peopleById = new Map();

  scriptPeople.forEach((person) => {
    if (person.id) peopleById.set(person.id, person);
  });

  if (Array.isArray(draftPeople)) {
    draftPeople.forEach((person) => {
      const knownPerson = knownById.get(person?.id) || knownByName.get(String(person?.name || "").toLowerCase());
      if (!knownPerson || !isValidPersonName(knownPerson.name, note)) return;
      const aliases = Array.isArray(knownPerson.aliases) ? knownPerson.aliases : [knownPerson.name];
      if (!aliases.some((alias) => noteIncludesName(note, alias))) return;
      peopleById.set(knownPerson.id, {
        id: knownPerson.id,
        name: knownPerson.name,
        matchedAlias: person.matchedAlias || knownPerson.name,
        confidence: Math.max(Number.isFinite(Number(person.confidence)) ? Number(person.confidence) : 0.82, 0.82),
        selected: person.selected !== false,
      });
    });
  }

  return [...peopleById.values()];
}

function normalizePossiblePeople(draftPossiblePeople, scriptPossiblePeople, knownPeople, note) {
  const knownNames = new Set(knownPeople.flatMap((person) => [
    person.name,
    ...(Array.isArray(person.aliases) ? person.aliases : []),
  ].map((name) => name.toLowerCase())));
  const possibleByName = new Map();

  [...scriptPossiblePeople, ...(Array.isArray(draftPossiblePeople) ? draftPossiblePeople : [])].forEach((person) => {
    const name = titleCase(person?.name || "");
    if (!isValidPersonName(name, note)) return;
    if (knownNames.has(name.toLowerCase())) return;
    const existing = possibleByName.get(name.toLowerCase());
    const confidence = Number.isFinite(Number(person.confidence)) ? Number(person.confidence) : 0.45;
    if (!existing || confidence > existing.confidence) {
      possibleByName.set(name.toLowerCase(), { name, confidence });
    }
  });

  return [...possibleByName.values()].slice(0, 8);
}

function sanitizeDraft(draft, scriptDraft, note, knownPeople = []) {
  const petNames = new Set(extractPetNames(note).map((name) => name.toLowerCase()));
  const relationshipOnlyNames = new Set(extractRelationshipOnlyNames(note).map((name) => name.toLowerCase()));
  const people = normalizeDraftPeople(draft.people, scriptDraft.people, knownPeople, note);
  const possiblePeople = normalizePossiblePeople(draft.possiblePeople, scriptDraft.possiblePeople, knownPeople, note);
  const cleanPossiblePeople = possiblePeople
    .filter((person) => !petNames.has(String(person.name || "").toLowerCase()))
    .filter((person) => {
      const lowerName = String(person.name || "").toLowerCase();
      return !relationshipOnlyNames.has(lowerName) || isDirectInteractionName(note, person.name);
    });
  const hasExistingPeople = people.length;
  const personNames = new Set([...people, ...cleanPossiblePeople].map((person) => String(person.name || "").toLowerCase()));
  const memoryCards = mergeCards(scriptDraft.memoryCards, Array.isArray(draft.memoryCards) ? draft.memoryCards : [])
    .filter((card) => {
      const label = String(card.label || "").toLowerCase();
      const value = String(card.value || "").toLowerCase();
      if (!RELATION_WORDS.has(label)) return true;
      return !personNames.has(value);
    });
  const questions = hasExistingPeople
    ? Array.isArray(draft.questions) ? draft.questions : []
    : cleanPossiblePeople.length ? [`Create a new profile for ${cleanPossiblePeople.map((person) => person.name).join(", ")}?`] : [];
  const draftInteraction = draft.interaction && typeof draft.interaction === "object" ? draft.interaction : {};
  return {
    ...scriptDraft,
    ...draft,
    people,
    possiblePeople: cleanPossiblePeople,
    memoryCards,
    reminders: mergeReminders(scriptDraft.reminders, Array.isArray(draft.reminders) ? draft.reminders : []),
    questions: questions.filter((question) => ![...petNames].some((name) => question.toLowerCase().includes(name)))
      .filter((question) => !/\b(their|my|our|his|her)\s+(kid|child|dad|father|mom|mother)\b/i.test(question))
      .filter((question) => !/quentin nichols/i.test(question)),
    interaction: {
      ...scriptDraft.interaction,
      ...draftInteraction,
      dateHint: chooseDateHint(scriptDraft.interaction?.dateHint, draftInteraction.dateHint),
      notes: note,
    },
  };
}

function extractReminder(note, topics, dateHint) {
  const lowerNote = note.toLowerCase();
  const hasFollowUpSignal = /\b(ask|follow up|check|remind|next time|later)\b/.test(lowerNote);
  const importantTopic = topics.find((topic) => ["exam", "surgery", "promotion", "roof", "graduation", "dinner", "appointment"].includes(topic));
  if (!hasFollowUpSignal && !importantTopic) return [];
  const reminders = [];

  const personOutcomePattern = /\bask\s+how\s+([A-Z][a-z]+)(?:['’]s)?\s+([^.!?,]+?)\s+went\b/gi;
  for (const match of note.matchAll(personOutcomePattern)) {
    const localDateHint = extractDateHint(sentenceForName(note, match[1]));
    reminders.push({
      title: `Ask about ${titleCase(match[1])}'s ${cleanText(match[2], 100)}`,
      details: localDateHint ? `Possible timing mentioned: ${localDateHint}` : dateHint ? `Possible timing mentioned: ${dateHint}` : "",
      confidence: 0.82,
    });
  }

  const adjustmentPattern = /\bask\s+how\s+([A-Z][a-z]+)\s+is\s+adjusting\b/gi;
  for (const match of note.matchAll(adjustmentPattern)) {
    const localDateHint = extractDateHint(sentenceForName(note, match[1]));
    reminders.push({
      title: `Ask how ${titleCase(match[1])} is adjusting`,
      details: localDateHint ? `Possible timing mentioned: ${localDateHint}` : dateHint ? `Possible timing mentioned: ${dateHint}` : "",
      confidence: 0.82,
    });
  }

  const appointmentOutcomePattern = /\bcheck\s+whether\s+([A-Z][a-z]+)(?:['’]s)?\s+appointment\s+went\s+okay\b/gi;
  for (const match of note.matchAll(appointmentOutcomePattern)) {
    const localDateHint = extractDateHint(sentenceForName(note, match[1]));
    reminders.push({
      title: `Check whether ${titleCase(match[1])}'s appointment went okay`,
      details: localDateHint ? `Possible timing mentioned: ${localDateHint}` : dateHint ? `Possible timing mentioned: ${dateHint}` : "",
      confidence: 0.82,
    });
  }

  const recoveryPattern = /\bcheck\s+back\s+about\s+([A-Z][a-z]+)(?:['’]s)?\s+recovery\b/gi;
  for (const match of note.matchAll(recoveryPattern)) {
    reminders.push({
      title: `Check back about ${titleCase(match[1])}'s recovery`,
      details: note.match(new RegExp(`\\b${escapeRegExp(match[1])}\\b[^.!?]*?\\b(surgery|appointment)[^.!?]*`, "i"))?.[0] || "",
      confidence: 0.84,
    });
  }

  const petAppointment = note.match(new RegExp(`\\b(?:his|her|their|my)\\s+(?:${PET_TYPE_PATTERN})\\s+([A-Z][a-z]+)\\s+has\\s+(?:an?\\s+)?([^.!?]*?appointment[^.!?]*?)(?:,?\\s+and\\s+I\\s+should\\s+ask\\s+how\\s+it\\s+went)?[.!?]`, "i"));
  if (petAppointment) {
    reminders.push({
      title: `Ask about ${petAppointment[1]}'s appointment`,
      details: cleanText(petAppointment[2], 220),
      confidence: 0.84,
    });
  }
  if (reminders.length) return mergeReminders(reminders, []);

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
      ? [`Create a new profile for ${possiblePeople.map((person) => person.name).join(", ")}?`]
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
      reasoning_effort: REASONING_EFFORT,
      reasoning_format: "hidden",
      response_format: DRAFT_RESPONSE_FORMAT,
      messages: [
        {
          role: "system",
          content:
            "You organize Quentin Nichols' private relationship notes. Follow the response schema exactly. Do not invent facts. Prefer existing people when names clearly match. Pets, animals, projects, places, organizations, relationship phrases, and possessive phrases are memory cards or topics, not people profiles. Never create people named things like 'their kid', 'my dad', or 'Quentin Nichols dad'. For family notes, extract actual full names and relationship facts.",
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
  return sanitizeDraft({ ...parsed, source: "ai" }, scriptDraft, note, people);
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
