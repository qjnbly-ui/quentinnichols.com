const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");
const { rebuildPersonOverview } = require("./_person-overview");
const { syncFollowUpTask } = require("./_follow-up-task");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanIsoDate(value) {
  const text = cleanText(value, 80);
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function cleanList(value, maxItems = 12, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanObjectList(value, maxItems = 12) {
  return Array.isArray(value) ? value.slice(0, maxItems) : [];
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
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
    const error = new Error(payload?.message || `Unable to insert ${table}.`);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

function cleanCalendarPayload(payload) {
  const title = cleanText(payload?.title, 220);
  const startsAt = cleanIsoDate(payload?.startsAt || payload?.starts_at);
  const endsAt = cleanIsoDate(payload?.endsAt || payload?.ends_at);
  if (!title) {
    const error = new Error("Event title is required.");
    error.statusCode = 400;
    throw error;
  }
  if (!startsAt) {
    const error = new Error("A valid start date is required.");
    error.statusCode = 400;
    throw error;
  }
  return {
    title,
    description: cleanText(payload?.description, 2000) || null,
    location: cleanText(payload?.location, 240) || null,
    starts_at: startsAt,
    ends_at: endsAt || null,
    all_day: Boolean(payload?.allDay ?? payload?.all_day),
    status: ["confirmed", "tentative", "cancelled"].includes(cleanText(payload?.status, 40))
      ? cleanText(payload?.status, 40)
      : "confirmed",
    source: cleanText(payload?.source, 80) || "ai_assistant",
    metadata: payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  };
}

async function applyCalendarAction({ user, supabaseRest, action }) {
  const record = cleanCalendarPayload(action.payload || {});
  const response = await supabaseRest("calendar_events?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: {
      owner_id: user.id,
      ...record,
      metadata: {
        ...record.metadata,
        confirmed_from_ai_action: true,
      },
    },
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to create calendar event.");
    error.statusCode = response.status;
    throw error;
  }
  return { event: payload[0] || null };
}

async function applyTaskAction({ user, supabaseRest, action }) {
  const payload = action.payload || {};
  const title = cleanText(payload.title, 220);
  if (!title) {
    const error = new Error("Task title is required.");
    error.statusCode = 400;
    throw error;
  }
  const dueAt = cleanIsoDate(payload.dueAt || payload.due_at);
  const record = {
    owner_id: user.id,
    title,
    description: cleanText(payload.description, 2000) || null,
    status: ["todo", "in_progress", "done", "archived"].includes(cleanText(payload.status, 40)) ? cleanText(payload.status, 40) : "todo",
    priority: ["low", "normal", "high", "urgent"].includes(cleanText(payload.priority, 40)) ? cleanText(payload.priority, 40) : "normal",
    due_at: dueAt || null,
    source: cleanText(payload.source, 80) || "ai_assistant",
    metadata: payload.metadata && typeof payload.metadata === "object"
      ? { ...payload.metadata, confirmed_from_ai_action: true }
      : { confirmed_from_ai_action: true },
  };
  const response = await supabaseRest("tasks?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: record,
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(rows?.message || "Unable to create task.");
    error.statusCode = response.status;
    throw error;
  }
  return { task: rows[0] || null };
}

async function loadOwnedPeople(supabaseRest) {
  const response = await supabaseRest("people?select=id,name,tags&order=updated_at.desc");
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to load people.");
    error.statusCode = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

async function createPeople({ user, supabaseRest, possiblePeople }) {
  const rows = possiblePeople
    .map((person) => ({
      owner_id: user.id,
      name: cleanText(person?.name, 160),
      tags: ["Captured"],
      overview: null,
      metadata: { source: "ai_action" },
    }))
    .filter((person) => person.name);
  return insertRows(supabaseRest, "people", rows);
}

async function applyPeopleMemoryAction({ user, supabaseRest, action }) {
  const payload = action.payload || {};
  const note = cleanText(payload.note, 5000);
  const draft = payload.draft && typeof payload.draft === "object" ? payload.draft : {};
  if (!note) {
    const error = new Error("A note is required.");
    error.statusCode = 400;
    throw error;
  }

  const ownedPeople = await loadOwnedPeople(supabaseRest);
  const ownedById = new Map(ownedPeople.map((person) => [person.id, person]));
  const selectedExisting = cleanObjectList(draft.people)
    .filter((person) => person?.selected !== false && looksLikeUuid(person?.id))
    .map((person) => ownedById.get(person.id))
    .filter(Boolean);
  const possiblePeople = cleanObjectList(draft.possiblePeople)
    .filter((person) => Number(person?.confidence || 0) >= 0.75 && cleanText(person?.name, 160));
  const createdPeople = selectedExisting.length ? [] : await createPeople({ user, supabaseRest, possiblePeople });
  const people = [...selectedExisting, ...createdPeople];

  if (!people.length) {
    const error = new Error("No profile was matched. Review the People notebook first.");
    error.statusCode = 400;
    throw error;
  }

  const interaction = draft.interaction && typeof draft.interaction === "object" ? draft.interaction : {};
  const topics = cleanList(interaction.topics).length ? cleanList(interaction.topics) : ["captured"];
  const memoryCards = cleanObjectList(draft.memoryCards)
    .map((card) => ({
      category: cleanText(card?.category, 80) || "general",
      label: cleanText(card?.label, 120),
      value: cleanText(card?.value, 1000),
      confidence: Number.isFinite(Number(card?.confidence)) ? Number(card.confidence) : 0.7,
      metadata: { source: "ai_action" },
    }))
    .filter((card) => card.label && card.value);
  const reminders = cleanObjectList(draft.reminders)
    .map((reminder) => ({
      title: cleanText(reminder?.title, 180),
      details: cleanText(reminder?.details, 1000) || null,
      remind_at: cleanIsoDate(reminder?.remindAt || reminder?.remind_at) || null,
      priority: cleanText(reminder?.priority, 20) || "normal",
      metadata: { source: "ai_action" },
    }))
    .filter((reminder) => reminder.title);

  const results = [];
  for (const person of people) {
    const interactionRows = await insertRows(supabaseRest, "person_interactions", [{
      owner_id: user.id,
      person_id: person.id,
      occurred_at: new Date().toISOString(),
      location: cleanText(interaction.location, 240) || null,
      notes: note,
      mood: cleanText(interaction.mood, 120) || null,
      topics,
      ai_summary: cleanText(draft.summary, 2000) || null,
      source: "ai_assistant",
      metadata: { source: "ai_action", action_type: action.type },
    }]);
    const sourceInteractionId = interactionRows[0]?.id || null;
    const [createdMemoryCards, createdReminders] = await Promise.all([
      insertRows(supabaseRest, "person_memory_cards", memoryCards.map((card) => ({
        owner_id: user.id,
        person_id: person.id,
        ...card,
        source_interaction_id: sourceInteractionId,
      }))),
      insertRows(supabaseRest, "person_follow_up_reminders", reminders.map((reminder) => ({
        owner_id: user.id,
        person_id: person.id,
        interaction_id: sourceInteractionId,
        ...reminder,
        status: "open",
      }))),
    ]);
    const linkedTasks = (await Promise.all(createdReminders.map((reminder) => (
      reminder.remind_at ? syncFollowUpTask(supabaseRest, user.id, reminder, { person }) : null
    )))).filter(Boolean);

    let overview = "";
    let overviewError = "";
    try {
      overview = await rebuildPersonOverview(supabaseRest, person.id, {
        useAi: true,
        requireAi: false,
        backfillMemoryCards: true,
      });
    } catch (error) {
      overviewError = error?.message || "AI overview refresh failed.";
    }

    results.push({
      id: person.id,
      name: person.name,
      interaction: interactionRows[0] || null,
      memoryCards: createdMemoryCards,
      reminders: createdReminders,
      linkedTasks,
      overview,
      overviewError,
    });
  }

  return { people: results };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { user, supabaseRest } = await getAuthedSupabase(req);
    const body = await readJsonBody(req);
    const action = body.action && typeof body.action === "object" ? body.action : {};

    if (action.type === "create_calendar_event") {
      json(res, 201, await applyCalendarAction({ user, supabaseRest, action }));
      return;
    }

    if (action.type === "create_task") {
      json(res, 201, await applyTaskAction({ user, supabaseRest, action }));
      return;
    }

    if (action.type === "update_people_memory") {
      json(res, 201, await applyPeopleMemoryAction({ user, supabaseRest, action }));
      return;
    }

    json(res, 400, { error: "Unsupported AI action." });
  } catch (error) {
    await handleApiError(res, error);
  }
};
