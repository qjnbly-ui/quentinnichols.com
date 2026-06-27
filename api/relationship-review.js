const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");
const { buildRelationshipDraft } = require("./relationship-note-draft");
const { syncFollowUpTask } = require("./_follow-up-task");
const { rebuildPersonOverview } = require("./_person-overview");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanObjectList(value, maxItems = 30) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems);
}

function cleanIsoDate(value) {
  const text = cleanText(value, 80);
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
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

function normalizedMemoryKey(card) {
  return [
    cleanText(card.label, 120).toLowerCase(),
    cleanText(card.value, 1000).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  ].join(":");
}

function normalizedReminderKey(reminder) {
  return cleanText(reminder.title, 180).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mergeUniqueSuggestions(drafts, existingMemoryCards, existingReminders) {
  const existingMemoryKeys = new Set(existingMemoryCards.map(normalizedMemoryKey));
  const existingReminderKeys = new Set(existingReminders.map(normalizedReminderKey));
  const memoryByKey = new Map();
  const reminderByKey = new Map();

  drafts.forEach((draft) => {
    cleanObjectList(draft.memoryCards, 20).forEach((card) => {
      const cleanCard = {
        category: cleanText(card.category, 80) || "general",
        label: cleanText(card.label, 120),
        value: cleanText(card.value, 1000),
        confidence: Number.isFinite(Number(card.confidence)) ? Number(card.confidence) : 0.72,
      };
      const key = normalizedMemoryKey(cleanCard);
      if (!cleanCard.label || !cleanCard.value || existingMemoryKeys.has(key)) return;
      const existing = memoryByKey.get(key);
      if (!existing || cleanCard.confidence > existing.confidence) memoryByKey.set(key, cleanCard);
    });

    cleanObjectList(draft.reminders, 12).forEach((reminder) => {
      const cleanReminder = {
        title: cleanText(reminder.title, 180),
        details: cleanText(reminder.details, 1000),
        remindAt: cleanIsoDate(reminder.remindAt || reminder.remind_at),
        priority: cleanText(reminder.priority, 20) || "normal",
        confidence: Number.isFinite(Number(reminder.confidence)) ? Number(reminder.confidence) : 0.72,
      };
      const key = normalizedReminderKey(cleanReminder);
      if (!cleanReminder.title || existingReminderKeys.has(key)) return;
      const existing = reminderByKey.get(key);
      if (!existing || cleanReminder.confidence > existing.confidence) reminderByKey.set(key, cleanReminder);
    });
  });

  return {
    memoryCards: [...memoryByKey.values()].slice(0, 12),
    reminders: [...reminderByKey.values()].slice(0, 8),
  };
}

function noteFromInteraction(interaction) {
  return [
    interaction.occurred_at ? `Date: ${interaction.occurred_at}` : "",
    interaction.location ? `Location: ${interaction.location}` : "",
    Array.isArray(interaction.topics) && interaction.topics.length ? `Topics: ${interaction.topics.join(", ")}` : "",
    interaction.ai_summary ? `Summary: ${interaction.ai_summary}` : "",
    interaction.notes || "",
  ].filter(Boolean).join("\n");
}

async function loadReviewContext(supabaseRest, personId, interactionId) {
  const [people, existingMemoryCards, existingReminders] = await Promise.all([
    loadRows(supabaseRest, `people?select=id,name&id=eq.${encodeURIComponent(personId)}&limit=1`, "Unable to load person."),
    loadRows(supabaseRest, `person_memory_cards?select=id,label,value&person_id=eq.${encodeURIComponent(personId)}`, "Unable to load memory cards."),
    loadRows(supabaseRest, `person_follow_up_reminders?select=id,title&person_id=eq.${encodeURIComponent(personId)}`, "Unable to load follow-ups."),
  ]);
  if (!people[0]) {
    const error = new Error("Person not found.");
    error.statusCode = 404;
    throw error;
  }

  const interactionPath = interactionId
    ? `person_interactions?select=*&person_id=eq.${encodeURIComponent(personId)}&id=eq.${encodeURIComponent(interactionId)}&limit=1`
    : `person_interactions?select=*&person_id=eq.${encodeURIComponent(personId)}&order=occurred_at.desc&limit=40`;
  const interactions = await loadRows(supabaseRest, interactionPath, "Unable to load conversations.");
  if (!interactions.length) {
    const error = new Error("No conversations found to review.");
    error.statusCode = 404;
    throw error;
  }

  return { person: people[0], interactions, existingMemoryCards, existingReminders };
}

async function reviewConversations(supabaseRest, personId, interactionId) {
  const context = await loadReviewContext(supabaseRest, personId, interactionId);
  const drafts = [];
  if (interactionId) {
    drafts.push(await buildRelationshipDraft(supabaseRest, noteFromInteraction(context.interactions[0])));
  } else {
    const combinedNote = context.interactions
      .map((interaction, index) => `Conversation ${index + 1}\n${noteFromInteraction(interaction)}`)
      .join("\n\n---\n\n")
      .slice(0, 12000);
    drafts.push(await buildRelationshipDraft(supabaseRest, combinedNote));
  }
  const suggestions = mergeUniqueSuggestions(drafts, context.existingMemoryCards, context.existingReminders);
  return {
    person: context.person,
    reviewedConversationCount: context.interactions.length,
    sourceInteractionId: interactionId || "",
    ...suggestions,
  };
}

async function insertRows(supabaseRest, table, rows) {
  if (!rows.length) return [];
  const response = await supabaseRest(`${table}?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: rows,
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || `Unable to save ${table}.`);
    error.statusCode = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

async function applySuggestions({ user, supabaseRest, personId, interactionId, memoryCards, reminders }) {
  const [people, existingMemoryCards, existingReminders] = await Promise.all([
    loadRows(supabaseRest, `people?select=id,name&id=eq.${encodeURIComponent(personId)}&limit=1`, "Unable to load person."),
    loadRows(supabaseRest, `person_memory_cards?select=id,label,value&person_id=eq.${encodeURIComponent(personId)}`, "Unable to load memory cards."),
    loadRows(supabaseRest, `person_follow_up_reminders?select=id,title&person_id=eq.${encodeURIComponent(personId)}`, "Unable to load follow-ups."),
  ]);
  if (!people[0]) {
    const error = new Error("Person not found.");
    error.statusCode = 404;
    throw error;
  }
  const existingMemoryKeys = new Set(existingMemoryCards.map(normalizedMemoryKey));
  const existingReminderKeys = new Set(existingReminders.map(normalizedReminderKey));

  const memoryRows = cleanObjectList(memoryCards, 20)
    .map((card) => ({
      owner_id: user.id,
      person_id: personId,
      category: cleanText(card.category, 80) || "general",
      label: cleanText(card.label, 120),
      value: cleanText(card.value, 1000),
      confidence: Number.isFinite(Number(card.confidence)) ? Number(card.confidence) : 0.78,
      source_interaction_id: looksLikeUuid(interactionId) ? interactionId : null,
      metadata: { source: "conversation_review" },
    }))
    .filter((card) => card.label && card.value)
    .filter((card) => !existingMemoryKeys.has(normalizedMemoryKey(card)));

  const reminderRows = cleanObjectList(reminders, 12)
    .map((reminder) => ({
      owner_id: user.id,
      person_id: personId,
      interaction_id: looksLikeUuid(interactionId) ? interactionId : null,
      title: cleanText(reminder.title, 180),
      details: cleanText(reminder.details, 1000) || null,
      remind_at: cleanIsoDate(reminder.remindAt || reminder.remind_at) || null,
      status: "open",
      priority: cleanText(reminder.priority, 20) || "normal",
      metadata: { source: "conversation_review" },
    }))
    .filter((reminder) => reminder.title)
    .filter((reminder) => !existingReminderKeys.has(normalizedReminderKey(reminder)));

  const [createdMemoryCards, createdReminders] = await Promise.all([
    insertRows(supabaseRest, "person_memory_cards", memoryRows),
    insertRows(supabaseRest, "person_follow_up_reminders", reminderRows),
  ]);
  const linkedTasks = (await Promise.all(createdReminders.map((reminder) => (
    reminder.remind_at ? syncFollowUpTask(supabaseRest, user.id, reminder, { person: people[0] }) : null
  )))).filter(Boolean);

  let overview = "";
  let overviewError = "";
  try {
    overview = await rebuildPersonOverview(supabaseRest, personId, {
      useAi: true,
      requireAi: true,
      backfillMemoryCards: true,
    });
  } catch (error) {
    overviewError = error?.message || "AI overview refresh failed.";
  }

  return { memoryCards: createdMemoryCards, reminders: createdReminders, linkedTasks, overview, overviewError };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { user, supabaseRest } = await getAuthedSupabase(req);
    const body = await readJsonBody(req);
    const personId = cleanText(body.personId || body.person_id, 80);
    const interactionId = cleanText(body.interactionId || body.interaction_id, 80);
    const mode = cleanText(body.mode, 40) || "review";
    if (!looksLikeUuid(personId) || (interactionId && !looksLikeUuid(interactionId))) {
      json(res, 400, { error: "A valid person and conversation are required." });
      return;
    }

    if (mode === "apply") {
      const result = await applySuggestions({
        user,
        supabaseRest,
        personId,
        interactionId,
        memoryCards: body.memoryCards || body.memory_cards,
        reminders: body.reminders,
      });
      json(res, 200, result);
      return;
    }

    const result = await reviewConversations(supabaseRest, personId, interactionId);
    json(res, 200, result);
  } catch (error) {
    await handleApiError(res, error);
  }
};
