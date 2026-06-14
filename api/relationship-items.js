const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");
const { deleteLinkedFollowUpTask, syncFollowUpTask } = require("./_follow-up-task");

const TABLES = {
  memory: "person_memory_cards",
  reminder: "person_follow_up_reminders",
};

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
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

function buildUpdate(type, body) {
  if (type === "memory") {
    return {
      category: cleanText(body.category, 80) || "general",
      label: cleanText(body.label, 120),
      value: cleanText(body.value, 1000),
    };
  }

  return {
    title: cleanText(body.title, 180),
    details: cleanText(body.details, 1000) || null,
    remind_at: cleanIsoDate(body.remindAt || body.remind_at) || null,
    status: cleanText(body.status, 20) || "open",
    priority: cleanText(body.priority, 20) || "normal",
  };
}

module.exports = async function handler(req, res) {
  if (!["PATCH", "DELETE"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { user, supabaseRest } = await getAuthedSupabase(req);
    const body = await readJsonBody(req);
    const type = cleanText(body.type, 40);
    const table = TABLES[type];
    const id = cleanText(body.id, 80);

    if (!table || !looksLikeUuid(id)) {
      json(res, 400, { error: "A valid item is required." });
      return;
    }

    const existingResponse = await supabaseRest(`${table}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
    const existingPayload = await existingResponse.json().catch(() => []);
    if (!existingResponse.ok || !existingPayload[0]) {
      json(res, existingResponse.ok ? 404 : existingResponse.status, { error: "Unable to find item." });
      return;
    }
    const existingItem = existingPayload[0];

    if (req.method === "DELETE") {
      if (type === "reminder") {
        await deleteLinkedFollowUpTask(supabaseRest, existingItem);
      }
      const response = await supabaseRest(`${table}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        json(res, response.status, { error: payload?.message || "Unable to delete item." });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    const update = buildUpdate(type, body);
    if ((type === "memory" && (!update.label || !update.value)) || (type === "reminder" && !update.title)) {
      json(res, 400, { error: "Required item fields are missing." });
      return;
    }

    const response = await supabaseRest(`${table}?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: update,
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      json(res, response.status, { error: payload?.message || "Unable to update item." });
      return;
    }
    let linkedTask = null;
    if (type === "reminder" && payload[0]) {
      linkedTask = await syncFollowUpTask(supabaseRest, user.id, payload[0]);
    }

    json(res, 200, { item: payload[0] || null, linkedTask });
  } catch (error) {
    await handleApiError(res, error);
  }
};
