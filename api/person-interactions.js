const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");
const { rebuildPersonOverview } = require("./_person-overview");
const { syncFollowUpTask } = require("./_follow-up-task");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanList(value, maxItems = 12, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function cleanObjectList(value, maxItems = 12) {
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

function firstName(value) {
  return cleanText(value, 160).split(/\s+/).filter(Boolean)[0] || "";
}

function relationshipFactTarget(value) {
  const match = cleanText(value, 1000).match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+my\s+(?:(?:great|younger|older)\s+)?(aunt|uncle|grandma|grandpa|grandmother|grandfather|cousin|sister|brother|mom|mother|dad|father)\b/i);
  return match ? match[1] : "";
}

function cardBelongsToPerson(card, person) {
  const label = cleanText(card?.label, 120).toLowerCase();
  if (label !== "family context") return true;
  const targets = cleanText(card?.value, 1000)
    .split(/\s*;\s*/)
    .map(relationshipFactTarget)
    .filter(Boolean)
    .map((name) => name.toLowerCase());
  if (!targets.length) return true;
  const personNames = [person?.name, firstName(person?.name)]
    .map((name) => cleanText(name, 160).toLowerCase())
    .filter(Boolean);
  return targets.some((target) => personNames.includes(target));
}

function reminderBelongsToPerson(reminder, person) {
  const text = `${reminder?.title || ""} ${reminder?.details || ""}`;
  const personNames = [person?.name, firstName(person?.name)]
    .map((name) => cleanText(name, 160).toLowerCase())
    .filter(Boolean);
  if (!personNames.length) return true;
  if (personNames.some((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text))) return true;
  const properNames = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  const ignored = new Set(["Soon", "Possible", "Timing", "Grandma", "Grandpa", "Aunt", "Uncle"]);
  const nonGenericNames = properNames.filter((name) => !ignored.has(name));
  return nonGenericNames.length === 0;
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

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { user, supabaseRest } = await getAuthedSupabase(req);

    if (req.method === "GET") {
      const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);
      const personId = requestUrl.searchParams.get("person_id") || "";
      if (!looksLikeUuid(personId)) {
        json(res, 400, { error: "A valid person_id is required." });
        return;
      }

      const response = await supabaseRest(
        `person_interactions?select=*&person_id=eq.${encodeURIComponent(personId)}&order=occurred_at.desc`
      );
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to load interactions." });
        return;
      }
      json(res, 200, { interactions: payload });
      return;
    }

    const body = await readJsonBody(req);
    const id = cleanText(body.id, 80);

    if (req.method === "DELETE") {
      if (!looksLikeUuid(id)) {
        json(res, 400, { error: "A valid interaction is required." });
        return;
      }

      const response = await supabaseRest(`person_interactions?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        json(res, response.status, { error: payload?.message || "Unable to delete interaction." });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    const personId = cleanText(body.personId || body.person_id, 80);
    const notes = cleanText(body.notes, 5000);
    if (req.method === "POST" && !looksLikeUuid(personId)) {
      json(res, 400, { error: "A valid person is required." });
      return;
    }
    if (!notes) {
      json(res, 400, { error: "Conversation notes are required." });
      return;
    }
    const personRows = looksLikeUuid(personId)
      ? await (async () => {
          const response = await supabaseRest(`people?select=id,name&id=eq.${encodeURIComponent(personId)}&limit=1`);
          const payload = await response.json().catch(() => []);
          if (!response.ok) return [];
          return Array.isArray(payload) ? payload : [];
        })()
      : [];
    const profilePerson = personRows[0] || null;

    if (req.method === "PATCH") {
      if (!looksLikeUuid(id)) {
        json(res, 400, { error: "A valid interaction is required." });
        return;
      }

      const update = {
        location: cleanText(body.location, 240) || null,
        notes,
        mood: cleanText(body.mood, 120) || null,
        topics: cleanList(body.topics),
        ai_summary: cleanText(body.aiSummary || body.ai_summary, 2000) || null,
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      };
      const occurredAt = cleanText(body.occurredAt || body.occurred_at, 80);
      if (occurredAt) update.occurred_at = occurredAt;
      const response = await supabaseRest(`person_interactions?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: update,
      });
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to update interaction." });
        return;
      }
      json(res, 200, { interaction: payload[0] || null });
      return;
    }

    const interactionRows = await insertRows(supabaseRest, "person_interactions", [
      {
        owner_id: user.id,
        person_id: personId,
        occurred_at: cleanText(body.occurredAt || body.occurred_at, 80) || new Date().toISOString(),
        location: cleanText(body.location, 240) || null,
        notes,
        mood: cleanText(body.mood, 120) || null,
        topics: cleanList(body.topics),
        ai_summary: cleanText(body.aiSummary || body.ai_summary, 2000) || null,
        source: cleanText(body.source, 80) || "manual",
        metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      },
    ]);
    const interaction = interactionRows[0] || null;

    const memoryCards = cleanObjectList(body.memoryCards || body.memory_cards)
      .map((card) => {
        if (typeof card === "string") {
          return { label: "Note", value: card };
        }
        return card;
      })
      .filter((card) => card && typeof card === "object" && cleanText(card.label, 120) && cleanText(card.value, 1000))
      .filter((card) => cardBelongsToPerson(card, profilePerson))
      .map((card) => ({
        owner_id: user.id,
        person_id: personId,
        category: cleanText(card.category, 80) || "general",
        label: cleanText(card.label, 120),
        value: cleanText(card.value, 1000),
        confidence: Number.isFinite(Number(card.confidence)) ? Number(card.confidence) : 1,
        source_interaction_id: interaction?.id || null,
        metadata: card.metadata && typeof card.metadata === "object" ? card.metadata : {},
      }));

    const reminders = cleanObjectList(body.reminders)
      .map((reminder) => {
        if (typeof reminder === "string") {
          return { title: reminder };
        }
        return reminder;
      })
      .filter((reminder) => reminder && typeof reminder === "object" && cleanText(reminder.title, 180))
      .filter((reminder) => reminderBelongsToPerson(reminder, profilePerson))
      .map((reminder) => ({
        owner_id: user.id,
        person_id: personId,
        interaction_id: interaction?.id || null,
        title: cleanText(reminder.title, 180),
        details: cleanText(reminder.details, 1000) || null,
        remind_at: cleanIsoDate(reminder.remindAt || reminder.remind_at) || null,
        status: "open",
        priority: cleanText(reminder.priority, 20) || "normal",
        metadata: reminder.metadata && typeof reminder.metadata === "object" ? reminder.metadata : {},
      }));

    const [createdMemoryCards, createdReminders] = await Promise.all([
      insertRows(supabaseRest, "person_memory_cards", memoryCards),
      insertRows(supabaseRest, "person_follow_up_reminders", reminders),
    ]);
    const linkedTasks = (await Promise.all(createdReminders.map((reminder) => (
      reminder.remind_at ? syncFollowUpTask(supabaseRest, user.id, reminder) : null
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

    json(res, 201, {
      interaction,
      memoryCards: createdMemoryCards,
      reminders: createdReminders,
      linkedTasks,
      overview,
      overviewError,
    });
  } catch (error) {
    await handleApiError(res, error);
  }
};
