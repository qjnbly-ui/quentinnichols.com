const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function cleanIsoDate(value) {
  const text = cleanText(value, 80);
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function cleanStatus(value) {
  const status = cleanText(value, 40);
  return ["todo", "in_progress", "done", "archived"].includes(status) ? status : "todo";
}

function cleanPriority(value) {
  const priority = cleanText(value, 40);
  return ["low", "normal", "high", "urgent"].includes(priority) ? priority : "normal";
}

function buildTaskRecord(body, existing = {}) {
  const title = cleanText(body.title, 220);
  if (!title) {
    const error = new Error("Task title is required.");
    error.statusCode = 400;
    throw error;
  }

  const status = cleanStatus(body.status);
  const completedAt = cleanIsoDate(body.completedAt || body.completed_at);
  const dueAt = cleanIsoDate(body.dueAt || body.due_at);

  return {
    title,
    description: cleanText(body.description, 2000) || null,
    status,
    priority: cleanPriority(body.priority),
    due_at: dueAt || null,
    completed_at: status === "done" ? completedAt || existing.completed_at || new Date().toISOString() : null,
    source: cleanText(body.source, 80) || existing.source || "dashboard",
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : existing.metadata || {},
  };
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { user, supabaseRest } = await getAuthedSupabase(req);
    const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);

    if (req.method === "GET") {
      const filters = [
        "select=id,title,description,status,priority,due_at,completed_at,source,metadata,created_at,updated_at",
        "order=due_at.asc.nullslast,created_at.desc",
      ];
      const status = cleanText(requestUrl.searchParams.get("status"), 40);
      if (status && ["todo", "in_progress", "done", "archived"].includes(status)) {
        filters.push(`status=eq.${encodeURIComponent(status)}`);
      }

      const response = await supabaseRest(`tasks?${filters.join("&")}`);
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to load tasks." });
        return;
      }

      json(res, 200, { tasks: payload });
      return;
    }

    const body = await readJsonBody(req);
    const id = cleanText(body.id || requestUrl.searchParams.get("id"), 80);

    if (req.method === "DELETE") {
      if (!looksLikeUuid(id)) {
        json(res, 400, { error: "A valid task is required." });
        return;
      }

      const response = await supabaseRest(`tasks?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        json(res, response.status, { error: payload?.message || "Unable to delete task." });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    if (req.method === "PATCH") {
      if (!looksLikeUuid(id)) {
        json(res, 400, { error: "A valid task is required." });
        return;
      }

      const existingResponse = await supabaseRest(`tasks?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
      const existingPayload = await existingResponse.json().catch(() => []);
      if (!existingResponse.ok || !existingPayload[0]) {
        json(res, existingResponse.ok ? 404 : existingResponse.status, { error: "Unable to find task." });
        return;
      }

      const response = await supabaseRest(`tasks?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: buildTaskRecord(body, existingPayload[0]),
      });
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to update task." });
        return;
      }

      json(res, 200, { task: payload[0] || null });
      return;
    }

    const response = await supabaseRest("tasks?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        owner_id: user.id,
        ...buildTaskRecord(body),
      },
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      json(res, response.status, { error: payload?.message || "Unable to create task." });
      return;
    }

    json(res, 201, { task: payload[0] || null });
  } catch (error) {
    await handleApiError(res, error);
  }
};
