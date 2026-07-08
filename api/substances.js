const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanIsoDate(value) {
  const text = cleanText(value, 80);
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clientId(value, prefix) {
  const existing = cleanText(value, 160);
  return existing || `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readRows(supabaseRest, path, errorMessage) {
  const response = await supabaseRest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || errorMessage);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

function entryRecord(body) {
  const type = cleanText(body.type, 120);
  if (!type) {
    const error = new Error("Substance type is required.");
    error.statusCode = 400;
    throw error;
  }
  return {
    client_id: clientId(body.clientId || body.client_id || body.id, "entry"),
    type,
    amount: cleanText(body.amount, 180) || null,
    context: cleanText(body.context, 180) || null,
    feeling_before: cleanText(body.feelingBefore || body.feeling_before, 180) || null,
    feeling_after: cleanText(body.feelingAfter || body.feeling_after, 180) || null,
    notes: cleanText(body.notes || body.note, 3000) || null,
    logged_at: cleanIsoDate(body.loggedAt || body.logged_at || body.date) || new Date().toISOString(),
  };
}

function cravingRecord(body) {
  const type = cleanText(body.type, 120);
  if (!type) {
    const error = new Error("Substance type is required.");
    error.statusCode = 400;
    throw error;
  }
  return {
    client_id: clientId(body.clientId || body.client_id || body.id, "craving"),
    type,
    intensity: Math.max(1, Math.min(5, Math.round(cleanNumber(body.intensity, 3)))),
    context: cleanText(body.context, 180) || null,
    action: cleanText(body.action, 1000) || null,
    logged_at: cleanIsoDate(body.loggedAt || body.logged_at || body.date) || new Date().toISOString(),
  };
}

function goalRows(userId, goals) {
  const source = goals && typeof goals === "object" ? goals : {};
  return ["nicotine", "alcohol", "caffeine"].map((category) => ({
    owner_id: userId,
    category,
    goal: cleanText(source[category], 1000) || null,
  }));
}

async function insertRow(supabaseRest, table, record) {
  const response = await supabaseRest(`${table}?select=*`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: record,
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || `Unable to save ${table}.`);
    error.statusCode = response.status;
    throw error;
  }
  return payload[0] || null;
}

async function upsertRows(supabaseRest, table, rows, conflictColumns) {
  if (!rows.length) return [];
  const response = await supabaseRest(`${table}?on_conflict=${conflictColumns}&select=*`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: rows,
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || `Unable to sync ${table}.`);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

async function deleteOwnedRows(supabaseRest, table, userId) {
  const response = await supabaseRest(`${table}?owner_id=eq.${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.message || `Unable to clear ${table}.`);
    error.statusCode = response.status;
    throw error;
  }
}

async function loadSubstanceData(supabaseRest) {
  const [entries, cravings, goals] = await Promise.all([
    readRows(supabaseRest, "substance_entries?select=*&order=logged_at.desc&limit=300", "Unable to load substance entries."),
    readRows(supabaseRest, "substance_cravings?select=*&order=logged_at.desc&limit=300", "Unable to load substance cravings."),
    readRows(supabaseRest, "substance_goals?select=*&order=category.asc", "Unable to load substance goals."),
  ]);
  return { entries, cravings, goals };
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { user, supabaseRest } = await getAuthedSupabase(req);
    const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const resource = cleanText(requestUrl.searchParams.get("resource") || "all", 40);

    if (req.method === "GET") {
      json(res, 200, await loadSubstanceData(supabaseRest));
      return;
    }

    if (req.method === "DELETE") {
      if (resource !== "all") {
        json(res, 400, { error: "Unknown substance resource." });
        return;
      }
      await Promise.all([
        deleteOwnedRows(supabaseRest, "substance_entries", user.id),
        deleteOwnedRows(supabaseRest, "substance_cravings", user.id),
      ]);
      json(res, 200, await loadSubstanceData(supabaseRest));
      return;
    }

    const body = await readJsonBody(req);
    if (resource === "entry") {
      const entry = await insertRow(supabaseRest, "substance_entries", { owner_id: user.id, ...entryRecord(body) });
      json(res, 201, { entry });
      return;
    }
    if (resource === "craving") {
      const craving = await insertRow(supabaseRest, "substance_cravings", { owner_id: user.id, ...cravingRecord(body) });
      json(res, 201, { craving });
      return;
    }
    if (resource === "goals") {
      const goals = await upsertRows(supabaseRest, "substance_goals", goalRows(user.id, body.goals || body), "owner_id,category");
      json(res, 200, { goals });
      return;
    }
    if (resource === "bulk") {
      const entries = Array.isArray(body.entries) ? body.entries.map((entry) => ({ owner_id: user.id, ...entryRecord(entry) })) : [];
      const cravings = Array.isArray(body.cravings) ? body.cravings.map((craving) => ({ owner_id: user.id, ...cravingRecord(craving) })) : [];
      if (entries.length) await upsertRows(supabaseRest, "substance_entries", entries, "owner_id,client_id");
      if (cravings.length) await upsertRows(supabaseRest, "substance_cravings", cravings, "owner_id,client_id");
      if (body.goals && typeof body.goals === "object") {
        await upsertRows(supabaseRest, "substance_goals", goalRows(user.id, body.goals), "owner_id,category");
      }
      json(res, 200, await loadSubstanceData(supabaseRest));
      return;
    }

    json(res, 400, { error: "Unknown substance resource." });
  } catch (error) {
    await handleApiError(res, error);
  }
};
