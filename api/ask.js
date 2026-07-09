const fs = require("fs/promises");
const path = require("path");
const { enforceRateLimit } = require("./_rate-limit");
const { getAuthedSupabase } = require("./_supabase-request");
const { buildRelationshipDraft } = require("./relationship-note-draft");

const MODEL = "llama-3.3-70b-versatile";
const MAX_CONTEXT_TOKENS = 100000;
const MAX_CONTEXT_WORDS = Math.floor(MAX_CONTEXT_TOKENS / 1.3);
const MAX_PRIVATE_CONTEXT_WORDS = 12000;
const USER_TIME_ZONE = "America/Los_Angeles";

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

function compactText(value, maxLength = 320) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function privateSearchText(person, interactions, memoryCards, reminders) {
  const personInteractions = interactions.filter((interaction) => interaction.person_id === person.id);
  const personMemoryCards = memoryCards.filter((card) => card.person_id === person.id);
  const personReminders = reminders.filter((reminder) => reminder.person_id === person.id);
  return [
    person.name,
    person.preferred_name,
    person.overview,
    person.first_met_location,
    ...(Array.isArray(person.tags) ? person.tags : []),
    ...personInteractions.flatMap((interaction) => [
      interaction.location,
      interaction.notes,
      interaction.ai_summary,
      ...(Array.isArray(interaction.topics) ? interaction.topics : []),
    ]),
    ...personMemoryCards.flatMap((card) => [card.category, card.label, card.value]),
    ...personReminders.flatMap((reminder) => [reminder.title, reminder.details]),
  ].filter(Boolean).join(" ");
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
      substanceEntries,
      substanceCravings,
      substanceGoals,
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
        "substance_entries?select=id,type,amount,context,feeling_before,feeling_after,notes,logged_at&order=logged_at.desc&limit=120"
      ),
      loadPrivateTable(
        supabaseRest,
        "substance_cravings?select=id,type,intensity,context,action,logged_at&order=logged_at.desc&limit=120"
      ),
      loadPrivateTable(
        supabaseRest,
        "substance_goals?select=id,category,goal,updated_at&order=category.asc"
      ),
      loadPrivateTable(
        supabaseRest,
        "ai_context_items?select=id,source_type,source_id,title,content,importance,updated_at&order=importance.desc&limit=120"
      ),
    ]);

    const peopleById = new Map(people.map((person) => [person.id, person]));
    const workSignals = people
      .map((person) => {
        const text = privateSearchText(person, interactions, memoryCards, reminders);
        if (!/\b(coworker|co-worker|foreman|boss|manager|work|worked|job|crew|fire hall|station|customer|client)\b/i.test(text)) {
          return "";
        }
        return `- ${person.name}: ${compactText(text)}`;
      })
      .filter(Boolean)
      .slice(0, 24);

    const relationshipSignals = people
      .map((person) => {
        const text = privateSearchText(person, interactions, memoryCards, reminders);
        if (!/\b(mom|mother|dad|father|sister|brother|daughter|son|wife|husband|family|friend|cousin|pet|dog|cat)\b/i.test(text)) {
          return "";
        }
        return `- ${person.name}: ${compactText(text)}`;
      })
      .filter(Boolean)
      .slice(0, 24);

    const context = `
Private app context from Supabase. This is current runtime data for Quentin's private dashboard. Treat it as private, user-owned data. Use it when relevant, but do not expose unrelated private details unless Quentin asks.

Notebook search signals:
Work, coworker, and role-related matches:
${workSignals.length ? workSignals.join("\n") : "- None loaded"}

Family, friend, and pet-related matches:
${relationshipSignals.length ? relationshipSignals.join("\n") : "- None loaded"}

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

Substance tracker goals:
${formatBullets(substanceGoals, (goal) => `- ${goal.category}: ${goal.goal || "No goal saved"}`)}

Recent substance use logs:
${formatBullets(substanceEntries, (entry) => {
  const feelings = [entry.feeling_before ? `before: ${entry.feeling_before}` : "", entry.feeling_after ? `after: ${entry.feeling_after}` : ""].filter(Boolean).join("; ");
  return `- ${entry.logged_at || "unknown date"} | ${entry.type}${entry.amount ? ` | amount: ${entry.amount}` : ""}${entry.context ? ` | context: ${entry.context}` : ""}${feelings ? ` | ${feelings}` : ""}${entry.notes ? ` | ${entry.notes}` : ""}`;
})}

Recent substance craving logs:
${formatBullets(substanceCravings, (craving) => `- ${craving.logged_at || "unknown date"} | ${craving.type} | intensity ${craving.intensity || 0}/5${craving.context ? ` | context: ${craving.context}` : ""}${craving.action ? ` | action: ${craving.action}` : ""}`)}

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

The current user is Quentin Nichols. You are not Quentin. You are Quentin's assistant speaking to him in second person. Treat "I", "me", and "my" in user messages as referring to Quentin, but answer with "you" and "your" when describing Quentin's life or app data. Never answer as if you are Quentin, and never say "my foreman", "my coworker", "I worked", or similar first-person claims unless directly quoting source text.

Current private dashboard context:
${privateAppContext}

Full site content (blog posts, about, photography, etc.):
${siteContext}

Your role: Think deeply, connect ideas across posts, recall details accurately, and provide insightful, personal-feeling responses as an assistant who knows Quentin's context well. Be reflective, honest, and direct. Use first-person wording only inside clearly marked quotations from Quentin's writing.

Default to a natural narrative voice instead of bullet lists. Summarize in your own words rather than mirroring headings or formatting from the source text. Only use lists if the user explicitly asks for a list or timeline.

Presentation rules: Format substantial answers in clean Markdown. Use short paragraphs, Markdown headings for major sections, numbered lists for sequences, bullets for grouped points, and bold labels inside list items when useful. Put blank lines between sections and list blocks. Do not use raw HTML.

Scripting rules: Ground responses in the provided text and avoid inventing facts. Keep the text's tone and style. Light interpretive commentary is allowed if it is clearly framed as interpretation and stays consistent with the text. Quote or paraphrase accurately without altering meaning. Be transparent about limitations when context is insufficient. Use the provided text as the primary source and only use external knowledge when explicitly permitted.

When the user asks to "tell a story" about a topic or person, assume they want existing information or anecdotes from the provided context, not a new narrative. If you're unsure or don't have enough context, ask for clarification instead of making assumptions.

Avoid repeating the same points across consecutive responses unless the user asks for a recap or comparison.

Private dashboard context is the best source for Quentin's current personal app data, including people, coworkers, family, conversations, memory cards, follow-ups, calendar events, tasks, and notes. For broad questions like "who is my coworker", "what do you know about my foreman", "who did I talk to", or "what should I follow up on", search the private dashboard context first before using website writing context. Do not say "your life, not Quentin's" because the user is Quentin. Still answer in second person: "your foreman was..." not "my foreman was...".

Saving rules: You cannot directly save calendar events, tasks, people entries, conversations, memory cards, or reminders from free-form text. If Quentin asks you to add, save, record, remember, or create something, do not say "I added", "I've added", "saved", or "recorded" unless the confirmed action result is already present in the conversation. Instead, say that the app should show a draft to confirm, or ask for the missing detail.

Answer questions based ONLY on the website content and private dashboard context unless asked otherwise. If something isn't covered, say so clearly.
When sharing site links, use Markdown with human-readable titles (e.g., [Photography](/photography/)) and avoid raw URLs.
When Quentin asks for a dashboard section link, use the private app route: [Calendar](/app/#calendar), [Tasks](/app/#tasks), [People](/app/#people), [Notes](/app/#notes), or [AI](/app/#ai). For a short follow-up like "link?" after a calendar answer, give the relevant dashboard link directly.`;
}

function latestUserMessage(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user" && typeof messages[index].content === "string") {
      return messages[index].content;
    }
  }
  return "";
}

function recentUserText(messages) {
  return messages
    .filter((msg) => msg?.role === "user" && typeof msg.content === "string")
    .slice(-3)
    .map((msg) => msg.content)
    .join("\n");
}

function previousUserMessage(messages) {
  let seenLatest = false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user" || typeof messages[index].content !== "string") continue;
    if (!seenLatest) {
      seenLatest = true;
      continue;
    }
    return messages[index].content;
  }
  return "";
}

function latestUserIndex(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user" && typeof messages[index].content === "string") return index;
  }
  return -1;
}

function previousAssistantMessage(messages, beforeIndex = messages.length) {
  for (let index = Math.min(beforeIndex - 1, messages.length - 1); index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant" && typeof messages[index].content === "string") {
      return messages[index].content;
    }
  }
  return "";
}

function getZonedDateParts(date = new Date(), timeZone = USER_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  if (!year || !month || !day) return null;
  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  return { year, month, day, weekday };
}

function addDaysToParts(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay(),
  };
}

function nextWeekdayParts(weekdayName, baseDate = new Date()) {
  const weekdays = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const target = weekdays[String(weekdayName || "").toLowerCase()];
  if (target === undefined) return null;
  const parts = getZonedDateParts(baseDate);
  if (!parts) return null;
  let daysUntil = (target - parts.weekday + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  return addDaysToParts(parts, daysUntil);
}

function timeZoneOffsetMs(date, timeZone = USER_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function zonedDateTimeToIso(parts, time, timeZone = USER_TIME_ZONE) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, time.hours, time.minutes, 0);
  const firstPass = new Date(utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone));
  const secondPass = new Date(utcGuess - timeZoneOffsetMs(firstPass, timeZone));
  return secondPass.toISOString();
}

function addHoursIso(isoDate, hours) {
  const date = new Date(isoDate);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function parseClockTime(text) {
  const matches = String(text || "").matchAll(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/gi);
  for (const match of matches) {
    const full = match[0] || "";
    if (!match[2] && !match[3] && !/^at\s+/i.test(full)) continue;
    let hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    const meridiem = String(match[3] || "").toLowerCase();
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) continue;
    if (meridiem === "pm" && hours < 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
    return { hours, minutes };
  }
  return null;
}

function parseNamedTime(text) {
  const value = String(text || "");
  if (/\bnoon\b/i.test(value)) return { hours: 12, minutes: 0 };
  if (/\bmidnight\b/i.test(value)) return { hours: 0, minutes: 0 };
  if (/\bmorning\b/i.test(value)) return { hours: 9, minutes: 0 };
  if (/\bafternoon\b/i.test(value)) return { hours: 14, minutes: 0 };
  if (/\bevening\b/i.test(value)) return { hours: 18, minutes: 0 };
  if (/\btonight\b/i.test(value)) return { hours: 20, minutes: 0 };
  return null;
}

function titleCaseEvent(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function cleanCalendarTitle(text) {
  const textValue = String(text || "");
  if (/\bhaircut\b/i.test(textValue)) return "Schedule Haircut";

  const colonMatch = textValue.match(/\b(?:add|create|put)\s+(?:this\s+)?(?:to|on)\s+(?:my\s+)?calendar\s*:\s*(.+)$/i)
    || textValue.match(/\b(?:add|create|put)\s+(?:this\s+)?(?:calendar\s+)?(?:event|appointment|reminder)\s*:\s*(.+)$/i);
  const source = colonMatch?.[1] || textValue;
  const cleaned = source
    .replace(/\b(add|create|put|please|schedule|calendar|appointment|reminder|to|my|on|at|this|next)\b/gi, " ")
    .replace(/\bevent\b/gi, " ")
    .replace(/\b(today|tomorrow|tonight|morning|afternoon|evening|noon|midnight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, " ")
    .replace(/^[\s:;,.!?-]+|[\s:;,.!?-]+$/g, "")
    .replace(/\s+/g, " ");
  return titleCaseEvent(cleaned || "Event");
}

function cleanTaskTitle(text) {
  const textValue = String(text || "");
  const colonMatch = textValue.match(/\b(?:add|create|make|save)\s+(?:this\s+)?(?:task|todo|to-do)\s*:\s*(.+)$/i);
  const source = colonMatch?.[1] || textValue;
  const cleaned = source
    .replace(/\b(add|create|make|save|please|task|todo|to-do|to|my|on|at|this|next|remind|reminder|me)\b/gi, " ")
    .replace(/\b(urgent|important|high priority|low priority|normal priority)\b/gi, " ")
    .replace(/\b(today|tomorrow|tonight|morning|afternoon|evening|noon|midnight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi, " ")
    .replace(/\b\d{1,2}(?::\d{2})?\s*(am|pm)?\b/gi, " ")
    .replace(/^[\s:;,.!?-]+|[\s:;,.!?-]+$/g, "")
    .replace(/\s+/g, " ");
  return titleCaseEvent(cleaned || "Task");
}

function weekdayIndex(name) {
  return {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  }[String(name || "").toLowerCase()];
}

function previousWeekdayParts(weekdayName, baseDate = new Date()) {
  const target = weekdayIndex(weekdayName);
  if (target === undefined) return null;
  const parts = getZonedDateParts(baseDate);
  if (!parts) return null;
  let daysBack = (parts.weekday - target + 7) % 7;
  if (daysBack === 0) daysBack = 7;
  return addDaysToParts(parts, -daysBack);
}

function partsToUtcMs(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, 12);
}

function buildHaircutCalendarAction(text) {
  if (!/\bhaircut\b/i.test(text) || !/\bcalendar\b/i.test(text)) return null;
  const intervalMatch = text.match(/\b(?:every|interval(?:\s+of)?|repeat(?:s|ing)?(?:\s+every)?)\s*(\d{1,2})\s*[- ]?\s*weeks?\b/i)
    || text.match(/\b(\d{1,2})\s*[- ]?\s*week\s+interval\b/i);
  const intervalWeeks = Number(intervalMatch?.[1] || 5);
  const targetWeekday = text.match(/\bon\s+a?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1]
    || text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1]
    || "wednesday";
  const baseWeekday = text.match(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)?.[1] || "friday";
  const baseDate = previousWeekdayParts(baseWeekday);
  if (!baseDate || !Number.isFinite(intervalWeeks) || intervalWeeks < 1) return null;

  let dateParts = addDaysToParts(baseDate, intervalWeeks * 7);
  const targetIndex = weekdayIndex(targetWeekday);
  if (targetIndex !== undefined) {
    dateParts = addDaysToParts(dateParts, targetIndex - dateParts.weekday);
  }
  const today = getZonedDateParts();
  while (today && partsToUtcMs(dateParts) < partsToUtcMs(today)) {
    dateParts = addDaysToParts(dateParts, intervalWeeks * 7);
  }

  const startsAt = zonedDateTimeToIso(dateParts, { hours: 9, minutes: 0 });
  return {
    type: "create_calendar_event",
    status: "draft",
    label: "Add calendar event",
    payload: {
      title: "Schedule Haircut",
      description: `Reminder to schedule a haircut. Suggested repeat interval: every ${intervalWeeks} weeks on ${titleCaseEvent(targetWeekday)}.`,
      startsAt,
      endsAt: addHoursIso(startsAt, 1),
      allDay: true,
      status: "confirmed",
      source: "ai_assistant",
      metadata: {
        created_by: "ai_assistant",
        original_text: text,
        user_timezone: USER_TIME_ZONE,
        recurrence: {
          frequency: "weekly",
          interval: intervalWeeks,
          weekday: String(targetWeekday).toLowerCase(),
        },
      },
    },
  };
}

function buildCalendarAction(messages) {
  const latest = latestUserMessage(messages);
  const recent = recentUserText(messages);
  if (/\b(task|todo|to-do)\b/i.test(latest) && !/\b(calendar|event|appointment)\b/i.test(latest)) return null;
  const haircutAction = buildHaircutCalendarAction(latest);
  if (haircutAction) return haircutAction;
  const wantsCalendar = wantsCalendarFromText(recent);
  const hasDateSignal = /\b(today|tomorrow|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(latest);
  const clock = parseClockTime(latest);
  if (!wantsCalendar && !(hasDateSignal && clock)) return null;

  const weekdayMatch = latest.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  let dateParts = null;
  if (/\btomorrow\b/i.test(latest)) {
    const today = getZonedDateParts();
    dateParts = today ? addDaysToParts(today, 1) : null;
  } else if (/\btoday|tonight\b/i.test(latest)) {
    dateParts = getZonedDateParts();
  } else if (weekdayMatch) {
    dateParts = nextWeekdayParts(weekdayMatch[1]);
  }

  const time = clock || parseNamedTime(latest);
  if (!dateParts || !time) return null;
  const startsAt = zonedDateTimeToIso(dateParts, time);
  const endsAt = addHoursIso(startsAt, 1);

  const title = cleanCalendarTitle(latest);
  if (!title || title.length < 2) return null;

  return {
    type: "create_calendar_event",
    status: "draft",
    label: "Add calendar event",
    payload: {
      title,
      startsAt,
      endsAt,
      allDay: false,
      status: "confirmed",
      source: "ai_assistant",
      metadata: {
        created_by: "ai_assistant",
        original_text: latest,
        user_timezone: USER_TIME_ZONE,
      },
    },
  };
}

function buildDueAtFromText(text) {
  const weekdayMatch = String(text || "").match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);
  let dateParts = null;
  if (/\btomorrow\b/i.test(text)) {
    const today = getZonedDateParts();
    dateParts = today ? addDaysToParts(today, 1) : null;
  } else if (/\btoday|tonight\b/i.test(text)) {
    dateParts = getZonedDateParts();
  } else if (weekdayMatch) {
    dateParts = nextWeekdayParts(weekdayMatch[1]);
  }
  if (!dateParts) return "";
  return zonedDateTimeToIso(dateParts, parseClockTime(text) || parseNamedTime(text) || { hours: 9, minutes: 0 });
}

function looksLikeReminderRequest(text) {
  return /\b(?:remind\s+me|reminder)\b/i.test(String(text || ""));
}

function wantsCalendarFromText(text) {
  const value = String(text || "").trim();
  if (!value || isWritingReviewRequest(value)) return false;
  const calendarTarget = /\b(calendar|event|appointment)\b/i.test(value);
  const scheduleIntent = /\b(add|create|put|schedule|book|set up|make)\b/i.test(value);
  return calendarTarget && scheduleIntent;
}

function hasDateSignal(text) {
  return /\b(today|tomorrow|tonight|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.test(String(text || ""));
}

function buildTaskAction(messages) {
  const latest = latestUserMessage(messages);
  const reminderRequest = looksLikeReminderRequest(latest);
  const wantsTask = (/\b(add|create|make|save)\b/i.test(latest) && /\b(task|todo|to-do)\b/i.test(latest))
    || (reminderRequest && !wantsCalendarFromText(latest));
  if (!wantsTask) return null;
  const title = cleanTaskTitle(latest);
  if (!title || title.length < 2) return null;
  const dueAt = buildDueAtFromText(latest) || null;
  if (reminderRequest && !dueAt) return null;
  return {
    type: "create_task",
    status: "draft",
    label: "Add task",
    payload: {
      title,
      description: latest,
      dueAt,
      status: "todo",
      priority: /\burgent\b/i.test(latest) ? "urgent" : /\b(important|high priority)\b/i.test(latest) ? "high" : "normal",
      source: "ai_assistant",
      metadata: {
        created_by: "ai_assistant",
        original_text: latest,
        user_timezone: USER_TIME_ZONE,
      },
    },
  };
}

function stripMemoryCommand(text) {
  return String(text || "")
    .replace(/^\s*(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:remember|save|record|note|add)\s+(?:this|that|it)?\s*(?:as\s+a?\s*)?(?:to\s+)?(?:my\s+)?(?:people\s+entry|person\s+entry|people\s+notebook|relationship\s+notebook|memory|memories|profile|people|notebook)?\s*:?\s*/i, "")
    .trim() || String(text || "").trim();
}

function cleanMemoryNoteText(text) {
  return stripMemoryCommand(text)
    .replace(/\s*(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:add|save|record|remember|note)\s+(?:that|this|it)?\s*(?:and\s+)?(?:the\s+)?(?:above|previous|prior|last)?\s*(?:note|message)?\s*(?:i\s+made\s+)?(?:about\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)?\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isAddReferenceCommand(text) {
  const value = String(text || "").trim();
  return /^(?:please\s+)?(?:add|save|record|remember|note)\s+(?:it|that|this)\.?$/i.test(value)
    || /\b(?:add|save|record|remember|note)\s+(?:it|that|this)\b/i.test(value);
}

function isContextReferenceMemoryRequest(text) {
  const value = String(text || "").trim();
  const saveVerb = /\b(add|save|record|remember|note)\b/i.test(value);
  if (isAddReferenceCommand(value)) return true;
  if (saveVerb && /\b(?:above|previous|prior|last)\s+(?:note|message)\b/i.test(value)) return true;
  return saveVerb
    && /\b(this|that|it)\b/i.test(value)
    && /\b(people entry|person entry|people notebook|relationship notebook|profile|memory|conversation|notebook)\b/i.test(value);
}

function isWritingReviewRequest(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const writingTarget = /\b(blog|post|article|essay|writing|writings|draft|piece)\b/i.test(value);
  const reviewIntent = /\b(what do you think|review|critique|feedback|add or remove|add\/remove|should i add|should i remove|anything to add|anything to remove|improve|edit)\b/i.test(value);
  return writingTarget && reviewIntent;
}

function wantsPeopleMemoryAction(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  if (isWritingReviewRequest(value)) return false;
  if (isContextReferenceMemoryRequest(value)) return true;
  if (/\b(add|save|record|remember|note)\b/i.test(value) && /\babout\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(value)) return true;
  if (/\b(add|save|record|remember|note)\b/i.test(value) && /\b(people notebook|relationship notebook|person|people|profile|memory|remember|notebook|conversation entry|people conversation)\b/i.test(value)) {
    return true;
  }
  if (/^\s*(?:remember|save|record|note)\s+(?:that\s+)?/i.test(value) && /\b(my|your)\s+(mom|mother|dad|father|sister|brother|cousin|friend|coworker|co-worker|boss|manager|foreman)\b/i.test(value)) {
    return true;
  }
  if (/\b(my|your)\s+(mom|mother|dad|father|sister|brother|cousin|friend|coworker|co-worker|boss|manager|foreman)\s+(?:is|was|named)\b/i.test(value) && /\b(remember|save|record|note|add)\b/i.test(value)) {
    return true;
  }
  return false;
}

function wantsCreativeOutput(text) {
  const value = String(text || "").trim();
  if (!value) return false;
  const creativeVerb = /\b(create|write|generate|draft|compose|make|produce|build|give me|turn (?:this|that|it) into)\b/i.test(value);
  const creativeTarget = /\b(song|lyrics?|chorus|verse|bridge|hook|prompt|poem|story|script|caption|post|essay|letter|email|message|bio|summary|outline|idea|ideas|rap|melody|music|article|copy)\b/i.test(value);
  return creativeVerb && creativeTarget;
}

function looksLikePeopleEncounterNote(text) {
  const value = String(text || "").trim();
  if (value.length < 40) return false;
  if (!/\b(?:I|we)\s+(?:saw|met|talked to|spoke with|ran into|visited with)\s+[A-Z][a-z]+/i.test(value)) return false;
  return /\b(today|yesterday|at|with|and|his|her|their|son|daughter|mom|dad|friend|coworker)\b/i.test(value);
}

function isBareProfileName(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 80) return false;
  if (/\b(add|save|record|remember|note|task|calendar|event|remind)\b/i.test(value)) return false;
  const parts = value.split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 3) return false;
  return parts.every((part) => /^[a-z][a-z'-]*$/i.test(part));
}

function assistantAskedForPeopleProfile(text) {
  return /\bpeople conversation entry\b/i.test(String(text || ""))
    && /\bperson or profile\b/i.test(String(text || ""));
}

function memoryCandidateFromRecentUsers(messages, beforeIndex) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const msg = messages[index];
    if (msg?.role !== "user" || typeof msg.content !== "string") continue;
    const value = msg.content.trim();
    if (!value) continue;
    if (isAddReferenceCommand(value) || wantsPeopleMemoryAction(value) || isBareProfileName(value)) continue;
    const cleaned = cleanMemoryNoteText(value);
    if (cleaned.length >= 4) return cleaned;
  }
  return "";
}

function profileHintFromRecentUsers(messages, beforeIndex) {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const msg = messages[index];
    if (msg?.role !== "user" || typeof msg.content !== "string") continue;
    const value = msg.content.trim();
    if (isBareProfileName(value)) return value;
  }
  return "";
}

function noteWithProfileHint(note, profileHint) {
  const cleanNote = String(note || "").trim();
  const cleanHint = String(profileHint || "").trim();
  if (!cleanHint || new RegExp(`\\b${cleanHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(cleanNote)) {
    return cleanNote;
  }
  return `${cleanHint}\n${cleanNote}`.trim();
}

function pendingPeopleMemoryNote(messages) {
  const index = latestUserIndex(messages);
  if (index < 0) return null;
  const latest = messages[index].content.trim();
  if (isBareProfileName(latest) && assistantAskedForPeopleProfile(previousAssistantMessage(messages, index))) {
    const note = memoryCandidateFromRecentUsers(messages, index);
    return note ? { note: noteWithProfileHint(note, latest), actionRequest: latest } : null;
  }
  if (isAddReferenceCommand(latest)) {
    const profileHint = profileHintFromRecentUsers(messages, index);
    const note = memoryCandidateFromRecentUsers(messages, index);
    return note ? { note: noteWithProfileHint(note, profileHint), actionRequest: latest } : null;
  }
  return null;
}

function referencedMemoryNote(messages, latest) {
  const current = cleanMemoryNoteText(latest);
  const prior = previousUserMessage(messages);
  if (/\b(?:above|previous|prior|last)\s+(?:note|message)\b/i.test(latest) && prior) {
    return [prior, current].map((part) => String(part || "").trim()).filter(Boolean).join("\n");
  }
  if (isContextReferenceMemoryRequest(latest) && prior && !current) return prior;
  return current || prior || stripMemoryCommand(latest);
}

function replyClaimsSave(reply) {
  return /\b(?:I(?:'ve| have)?\s+)?(?:added|saved|recorded|created)\b/i.test(String(reply || ""));
}

function actionClarificationReply(messages) {
  const latest = latestUserMessage(messages);
  const recent = recentUserText(messages);
  if (!latest) return "";

  if (looksLikeReminderRequest(latest) && !wantsCalendarFromText(latest) && !buildDueAtFromText(latest)) {
    return "I can make that a task reminder, but I need a date or time first. When should I remind you?";
  }

  if (wantsCalendarFromText(latest)) {
    const missingDate = !hasDateSignal(latest);
    const missingTime = !parseClockTime(latest) && !parseNamedTime(latest);
    if (missingDate && missingTime) return "I can draft a calendar event for review. What date and time should I use?";
    if (missingDate) return "I can draft a calendar event for review. What date should I put it on?";
    if (missingTime) return "I can draft a calendar event for review. What time should I use?";
  }

  if (wantsPeopleMemoryAction(latest)) {
    return "I can draft that as a people conversation entry, but I need the person or profile it should attach to.";
  }

  const saveLike = /\b(add|create|make|save|record|remember|note|remind)\b/i.test(latest);
  const hasKnownTarget = /\b(task|todo|to-do|calendar|event|appointment|people|person|profile|memory|conversation|notebook)\b/i.test(recent);
  if (saveLike && !hasKnownTarget && !wantsCreativeOutput(latest)) {
    return "Should I turn that into a task reminder, a calendar event, or a people conversation entry?";
  }

  return "";
}

async function buildPeopleMemoryAction(messages, supabaseRest) {
  const latest = latestUserMessage(messages);
  const pendingRequest = pendingPeopleMemoryNote(messages);
  const explicitRequest = Boolean(pendingRequest) || wantsPeopleMemoryAction(latest);
  const suggestedFromEncounter = !explicitRequest && looksLikePeopleEncounterNote(latest);
  if (!explicitRequest && !suggestedFromEncounter) return null;
  const note = pendingRequest?.note || (explicitRequest
    ? referencedMemoryNote(messages, latest)
    : cleanMemoryNoteText(latest));
  if (!note || note.length < 4) return null;
  const draft = await buildRelationshipDraft(supabaseRest, note);
  const hasProfile = Array.isArray(draft.people) && draft.people.length;
  const hasNewProfile = Array.isArray(draft.possiblePeople) && draft.possiblePeople.some((person) => Number(person.confidence || 0) >= 0.75);
  const hasMemory = Array.isArray(draft.memoryCards) && draft.memoryCards.length;
  const hasReminder = Array.isArray(draft.reminders) && draft.reminders.length;
  if (!hasProfile && !hasNewProfile && !hasMemory && !hasReminder) return null;
  return {
    type: "update_people_memory",
    status: "draft",
    label: "Review Conversation Entry",
    payload: {
      note,
      draft,
      source: "ai_assistant",
      actionRequest: pendingRequest?.actionRequest || (explicitRequest ? latest : ""),
      suggested: suggestedFromEncounter,
    },
  };
}

async function extractActions(messages, supabaseRest) {
  const calendarAction = buildCalendarAction(messages);
  if (calendarAction) return [calendarAction];
  const taskAction = buildTaskAction(messages);
  if (taskAction) return [taskAction];
  const peopleMemoryAction = await buildPeopleMemoryAction(messages, supabaseRest);
  return peopleMemoryAction ? [peopleMemoryAction] : [];
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

    let authedSupabase = null;
    const [siteContext, privateAppContext] = await Promise.all([
      loadSiteContext(),
      loadPrivateAppContext(req),
    ]);
    try {
      authedSupabase = await getAuthedSupabase(req);
    } catch (_error) {
      authedSupabase = null;
    }
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
    const actions = authedSupabase ? await extractActions(trimmedMessages, authedSupabase.supabaseRest) : [];
    const clarification = actions.length ? "" : actionClarificationReply(trimmedMessages);
    const finalReply = clarification
      ? clarification
      : actions.length && actions[0]?.payload?.suggested
      ? replyClaimsSave(reply)
        ? "I drafted a conversation entry from that. Review it below before saving."
        : reply
      : actions.length && actions[0]?.type === "create_calendar_event"
      ? "I drafted this calendar event. Review it below before saving."
      : actions.length && actions[0]?.type === "create_task"
        ? "I drafted this task. Review it below before saving."
      : actions.length && actions[0]?.type === "update_people_memory"
        ? "I drafted a conversation entry. Review it below before saving."
      : reply;
    res.status(200).json({ reply: finalReply, actions });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
