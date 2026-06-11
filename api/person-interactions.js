const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");

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

function buildProfileOverview(person, interactions, memoryCards) {
  const name = cleanText(person?.name, 160) || "This person";
  const preferred = cleanText(person?.preferred_name, 160);
  const tags = Array.isArray(person?.tags) ? person.tags.map((tag) => cleanText(tag, 48)).filter(Boolean) : [];
  const topMemories = memoryCards
    .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
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
  sentences.push(identityBits.length ? `${name} ${identityBits.join(" and ")}.` : `${name} is a profile in your people notebook.`);
  if (topMemories.length) {
    sentences.push(`Key memory: ${topMemories.join("; ")}.`);
  }
  if (topicList.length) {
    sentences.push(`Your notes around this profile touch on ${topicList.join(", ")}.`);
  }
  if (recentNotes.length) {
    sentences.push(`Recent context: ${recentNotes.join(" ")}`);
  }

  return cleanText(sentences.join(" ").replace(/\s+/g, " "), 2000);
}

async function rebuildPersonOverview(supabaseRest, personId) {
  const encodedPersonId = encodeURIComponent(personId);
  const [people, interactions, memoryCards] = await Promise.all([
    loadRows(
      supabaseRest,
      `people?select=id,name,preferred_name,tags&limit=1&id=eq.${encodedPersonId}`,
      "Unable to load person."
    ),
    loadRows(
      supabaseRest,
      `person_interactions?select=id,notes,topics,ai_summary,occurred_at&person_id=eq.${encodedPersonId}&order=occurred_at.desc&limit=40`,
      "Unable to load interactions."
    ),
    loadRows(
      supabaseRest,
      `person_memory_cards?select=id,label,value,confidence,updated_at&person_id=eq.${encodedPersonId}&order=updated_at.desc&limit=80`,
      "Unable to load memory cards."
    ),
  ]);
  const overview = buildProfileOverview(people[0], interactions, memoryCards);
  if (!overview) return "";
  const response = await supabaseRest(`people?id=eq.${encodedPersonId}`, {
    method: "PATCH",
    body: { overview },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to update profile overview.");
    error.statusCode = response.status;
    throw error;
  }
  return overview;
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
      .map((reminder) => ({
        owner_id: user.id,
        person_id: personId,
        interaction_id: interaction?.id || null,
        title: cleanText(reminder.title, 180),
        details: cleanText(reminder.details, 1000) || null,
        remind_at: cleanText(reminder.remindAt || reminder.remind_at, 80) || null,
        status: "open",
        priority: cleanText(reminder.priority, 20) || "normal",
        metadata: reminder.metadata && typeof reminder.metadata === "object" ? reminder.metadata : {},
      }));

    const [createdMemoryCards, createdReminders] = await Promise.all([
      insertRows(supabaseRest, "person_memory_cards", memoryCards),
      insertRows(supabaseRest, "person_follow_up_reminders", reminders),
    ]);
    const overview = await rebuildPersonOverview(supabaseRest, personId);

    json(res, 201, {
      interaction,
      memoryCards: createdMemoryCards,
      reminders: createdReminders,
      overview,
    });
  } catch (error) {
    await handleApiError(res, error);
  }
};
