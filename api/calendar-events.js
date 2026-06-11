const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function cleanStatus(value) {
  const status = cleanText(value, 40);
  return ["confirmed", "tentative", "cancelled"].includes(status) ? status : "confirmed";
}

function cleanIsoDate(value) {
  const text = cleanText(value, 80);
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function buildEventRecord(body) {
  const title = cleanText(body.title, 220);
  const startsAt = cleanIsoDate(body.startsAt || body.starts_at);
  const endsAt = cleanIsoDate(body.endsAt || body.ends_at);

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
    description: cleanText(body.description, 2000) || null,
    location: cleanText(body.location, 240) || null,
    starts_at: startsAt,
    ends_at: endsAt || null,
    all_day: Boolean(body.allDay ?? body.all_day),
    status: cleanStatus(body.status),
    source: cleanText(body.source, 80) || "dashboard",
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
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
      const start = cleanIsoDate(requestUrl.searchParams.get("start"));
      const end = cleanIsoDate(requestUrl.searchParams.get("end"));
      const filters = [
        "select=id,title,description,location,starts_at,ends_at,all_day,status,source,metadata,created_at,updated_at",
        "order=starts_at.asc",
      ];
      if (start) filters.push(`starts_at=gte.${encodeURIComponent(start)}`);
      if (end) filters.push(`starts_at=lte.${encodeURIComponent(end)}`);

      const response = await supabaseRest(`calendar_events?${filters.join("&")}`);
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to load calendar events." });
        return;
      }

      json(res, 200, { events: payload });
      return;
    }

    const body = await readJsonBody(req);
    const id = cleanText(body.id || requestUrl.searchParams.get("id"), 80);

    if (req.method === "DELETE") {
      if (!looksLikeUuid(id)) {
        json(res, 400, { error: "A valid calendar event is required." });
        return;
      }

      const response = await supabaseRest(`calendar_events?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        json(res, response.status, { error: payload?.message || "Unable to delete calendar event." });
        return;
      }
      json(res, 200, { ok: true });
      return;
    }

    const record = buildEventRecord(body);

    if (req.method === "PATCH") {
      if (!looksLikeUuid(id)) {
        json(res, 400, { error: "A valid calendar event is required." });
        return;
      }

      const response = await supabaseRest(`calendar_events?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      });
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to update calendar event." });
        return;
      }

      json(res, 200, { event: payload[0] || null });
      return;
    }

    const response = await supabaseRest("calendar_events?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        owner_id: user.id,
        ...record,
      },
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      json(res, response.status, { error: payload?.message || "Unable to create calendar event." });
      return;
    }

    json(res, 201, { event: payload[0] || null });
  } catch (error) {
    await handleApiError(res, error);
  }
};
