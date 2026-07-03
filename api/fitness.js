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

function cleanNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanJson(value, fallback) {
  return value && typeof value === "object" ? value : fallback;
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

function templateRecord(body) {
  const name = cleanText(body.name, 180);
  if (!name) {
    const error = new Error("Template name is required.");
    error.statusCode = 400;
    throw error;
  }
  const exercises = Array.isArray(body.exercises) ? body.exercises : [];
  if (!exercises.length) {
    const error = new Error("At least one exercise is required.");
    error.statusCode = 400;
    throw error;
  }
  return {
    name,
    description: cleanText(body.description, 1000) || null,
    rounds: Math.max(1, Math.min(30, Math.round(cleanNumber(body.rounds, 1)))),
    exercises,
    is_active: body.isActive ?? body.is_active ?? true,
  };
}

function sessionRecord(body) {
  return {
    template_id: looksLikeUuid(body.templateId || body.template_id) ? body.templateId || body.template_id : null,
    template_name: cleanText(body.templateName || body.template_name, 180) || null,
    started_at: cleanIsoDate(body.startedAt || body.started_at || body.date) || new Date().toISOString(),
    completed_at: cleanIsoDate(body.completedAt || body.completed_at) || new Date().toISOString(),
    completed_sets: Math.max(0, Math.round(cleanNumber(body.completedSets || body.completed_sets, 0))),
    total_sets: Math.max(0, Math.round(cleanNumber(body.totalSets || body.total_sets, 0))),
    exercises: Array.isArray(body.exercises) ? body.exercises : [],
    detected_prs: Array.isArray(body.detectedPrs || body.detected_prs) ? body.detectedPrs || body.detected_prs : [],
    energy: cleanNumber(body.energy, 0) || null,
    mood: cleanNumber(body.mood, 0) || null,
    soreness: cleanNumber(body.soreness, 0) || null,
    notes: cleanText(body.notes || body.note, 3000) || null,
    metadata: cleanJson(body.metadata, {}),
  };
}

function prRecord(body) {
  const exercise = cleanText(body.exercise, 180);
  const value = cleanText(body.value, 180);
  if (!exercise || !value) {
    const error = new Error("Exercise and record value are required.");
    error.statusCode = 400;
    throw error;
  }
  return {
    exercise,
    value,
    e1rm: cleanNumber(body.e1rm, 0) || null,
    recorded_at: cleanIsoDate(body.recordedAt || body.recorded_at || body.date) || new Date().toISOString(),
    source: cleanText(body.source, 40) || "manual",
    notes: cleanText(body.notes || body.note, 2000) || null,
  };
}

function checkinRecord(body) {
  return {
    checked_at: cleanIsoDate(body.checkedAt || body.checked_at || body.date) || new Date().toISOString(),
    energy: cleanNumber(body.energy, 0) || null,
    mood: cleanNumber(body.mood, 0) || null,
    soreness: cleanNumber(body.soreness, 0) || null,
    sleep: cleanNumber(body.sleep, 0) || null,
    notes: cleanText(body.notes || body.note, 2000) || null,
  };
}

function habitRecord(body) {
  const name = cleanText(body.name || body.habit, 180);
  if (!name) {
    const error = new Error("Habit name is required.");
    error.statusCode = 400;
    throw error;
  }
  return {
    name,
    category: cleanText(body.category, 80) || "manual",
    is_active: body.isActive ?? body.is_active ?? true,
  };
}

function habitLogRecord(body) {
  const habit = cleanText(body.habit, 180);
  if (!habit) {
    const error = new Error("Habit is required.");
    error.statusCode = 400;
    throw error;
  }
  return {
    habit_id: looksLikeUuid(body.habitId || body.habit_id) ? body.habitId || body.habit_id : null,
    habit,
    logged_at: cleanIsoDate(body.loggedAt || body.logged_at || body.date) || new Date().toISOString(),
    notes: cleanText(body.notes || body.note, 1000) || null,
  };
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

async function patchRow(supabaseRest, table, id, record) {
  if (!looksLikeUuid(id)) {
    const error = new Error("A valid record is required.");
    error.statusCode = 400;
    throw error;
  }
  const response = await supabaseRest(`${table}?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: record,
  });
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || `Unable to update ${table}.`);
    error.statusCode = response.status;
    throw error;
  }
  return payload[0] || null;
}

async function deleteRow(supabaseRest, table, id) {
  if (!looksLikeUuid(id)) {
    const error = new Error("A valid record is required.");
    error.statusCode = 400;
    throw error;
  }
  const response = await supabaseRest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.message || `Unable to delete ${table}.`);
    error.statusCode = response.status;
    throw error;
  }
}

module.exports = async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { user, supabaseRest } = await getAuthedSupabase(req);
    const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const resource = cleanText(requestUrl.searchParams.get("resource") || "all", 40);

    if (req.method === "GET") {
      const [templates, sessions, prs, checkins, habits, habitLogs] = await Promise.all([
        readRows(supabaseRest, "fitness_workout_templates?select=*&order=is_active.desc,updated_at.desc", "Unable to load workout templates."),
        readRows(supabaseRest, "fitness_sessions?select=*&order=started_at.desc&limit=120", "Unable to load workout sessions."),
        readRows(supabaseRest, "fitness_prs?select=*&order=recorded_at.desc&limit=200", "Unable to load PRs."),
        readRows(supabaseRest, "fitness_checkins?select=*&order=checked_at.desc&limit=200", "Unable to load check-ins."),
        readRows(supabaseRest, "fitness_habits?select=*&order=is_active.desc,name.asc", "Unable to load habits."),
        readRows(supabaseRest, "fitness_habit_logs?select=*&order=logged_at.desc&limit=300", "Unable to load habit logs."),
      ]);
      json(res, 200, { templates, sessions, prs, checkins, habits, habitLogs });
      return;
    }

    const body = await readJsonBody(req);
    const id = cleanText(body.id || requestUrl.searchParams.get("id"), 80);

    if (req.method === "DELETE") {
      const table = {
        template: "fitness_workout_templates",
        session: "fitness_sessions",
        pr: "fitness_prs",
        checkin: "fitness_checkins",
        habit: "fitness_habits",
        habitLog: "fitness_habit_logs",
      }[resource];
      if (!table) {
        json(res, 400, { error: "Unknown fitness resource." });
        return;
      }
      await deleteRow(supabaseRest, table, id);
      json(res, 200, { ok: true });
      return;
    }

    const builders = {
      template: ["fitness_workout_templates", templateRecord],
      session: ["fitness_sessions", sessionRecord],
      pr: ["fitness_prs", prRecord],
      checkin: ["fitness_checkins", checkinRecord],
      habit: ["fitness_habits", habitRecord],
      habitLog: ["fitness_habit_logs", habitLogRecord],
    };
    const entry = builders[resource];
    if (!entry) {
      json(res, 400, { error: "Unknown fitness resource." });
      return;
    }

    const [table, build] = entry;
    const record = { owner_id: user.id, ...build(body) };
    const saved = req.method === "PATCH"
      ? await patchRow(supabaseRest, table, id, build(body))
      : await insertRow(supabaseRest, table, record);
    json(res, req.method === "PATCH" ? 200 : 201, { [resource]: saved });
  } catch (error) {
    await handleApiError(res, error);
  }
};
