const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");

function cleanText(value, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanTags(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => cleanText(tag, 48))
    .filter(Boolean)
    .slice(0, 12);
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function cleanRecordId(value) {
  const id = cleanText(value, 80);
  if (looksLikeUuid(id) || /^\d+$/.test(id)) return id;
  return "";
}

function cleanBirthday(value) {
  const text = cleanText(value, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return "";
  const [year, month, day] = text.split("-").map(Number);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return "";
  return text;
}

function cleanMetadata(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function loadPersonMetadata(supabaseRest, personId) {
  if (!cleanRecordId(personId)) return {};
  const response = await supabaseRest(`people?select=metadata&id=eq.${encodeURIComponent(personId)}&limit=1`);
  const payload = await response.json().catch(() => []);
  if (!response.ok) return {};
  return cleanMetadata(payload[0]?.metadata);
}

async function loadOwnedPersonIds(supabaseRest, { id, name, ownerId }) {
  const recordId = cleanRecordId(id);
  if (recordId) return [recordId];
  const cleanName = cleanText(name, 160);
  if (!cleanName) return [];

  const response = await supabaseRest(
    `people?select=id,name&owner_id=eq.${encodeURIComponent(ownerId)}&name=eq.${encodeURIComponent(cleanName)}`
  );
  let payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to find person.");
    error.statusCode = response.status;
    throw error;
  }
  if (!payload.length) {
    const fuzzyResponse = await supabaseRest(
      `people?select=id,name&owner_id=eq.${encodeURIComponent(ownerId)}&name=ilike.${encodeURIComponent(`*${cleanName}*`)}`
    );
    payload = await fuzzyResponse.json().catch(() => []);
    if (!fuzzyResponse.ok) {
      const error = new Error(payload?.message || "Unable to find person.");
      error.statusCode = fuzzyResponse.status;
      throw error;
    }
  }
  return payload
    .filter((person) => cleanText(person.name, 160).toLowerCase() === cleanName.toLowerCase())
    .map((person) => cleanRecordId(person.id))
    .filter(Boolean);
}

async function deletePersonViaRpc(supabaseRest, personId) {
  const response = await supabaseRest("rpc/delete_person_profile_cascade", {
    method: "POST",
    body: { target_person_id: personId },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload?.message || "Unable to delete person.");
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

    if (req.method === "GET") {
      const response = await supabaseRest(
        "people?select=id,name,preferred_name,photo_url,phone,email,tags,first_met_at,first_met_location,overview,metadata,created_at,updated_at&order=updated_at.desc"
      );
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to load people." });
        return;
      }
      json(res, 200, { people: payload });
      return;
    }

    const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const body = await readJsonBody(req);
    const id = cleanText(body.id || requestUrl.searchParams.get("id"), 80);
    const name = cleanText(body.name || requestUrl.searchParams.get("name"), 160);
    const action = cleanText(body.action || requestUrl.searchParams.get("action"), 40);

    if (req.method === "DELETE" || (req.method === "POST" && action === "delete")) {
      const personIds = await loadOwnedPersonIds(supabaseRest, { id, name, ownerId: user.id });
      if (!personIds.length) {
        json(res, 400, { error: "A valid person is required. Refresh the app and try again." });
        return;
      }
      if (personIds.length > 1) {
        json(res, 409, { error: "More than one matching profile exists. Open the exact profile and try again." });
        return;
      }

      const personId = personIds[0];
      await deletePersonViaRpc(supabaseRest, personId);
      json(res, 200, { ok: true });
      return;
    }

    if (!name) {
      json(res, 400, { error: "Name is required." });
      return;
    }

    const existingMetadata = req.method === "PATCH" ? await loadPersonMetadata(supabaseRest, id) : {};
    const metadata = {
      ...existingMetadata,
      ...cleanMetadata(body.metadata),
    };
    const birthday = cleanBirthday(body.birthday || body.birthdate || metadata.birthday);
    if (birthday) metadata.birthday = birthday;
    if ((body.birthday === "" || body.birthdate === "" || metadata.birthday === "") && !birthday) delete metadata.birthday;

    const record = {
      name,
      preferred_name: cleanText(body.preferredName || body.preferred_name, 160) || null,
      photo_url: cleanText(body.photoUrl || body.photo_url, 1000) || null,
      phone: cleanText(body.phone, 80) || null,
      email: cleanText(body.email, 160) || null,
      tags: cleanTags(body.tags),
      first_met_at: cleanText(body.firstMetAt || body.first_met_at, 80) || null,
      first_met_location: cleanText(body.firstMetLocation || body.first_met_location, 240) || null,
      overview: cleanText(body.overview, 2000) || null,
      metadata,
    };

    if (req.method === "PATCH") {
      if (!cleanRecordId(id)) {
        json(res, 400, { error: "A valid person is required." });
        return;
      }

      const response = await supabaseRest(`people?id=eq.${encodeURIComponent(id)}&select=*`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: record,
      });
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        json(res, response.status, { error: payload?.message || "Unable to update person." });
        return;
      }

      json(res, 200, { person: payload[0] || null });
      return;
    }

    const insert = {
      owner_id: user.id,
      ...record,
    };

    const response = await supabaseRest("people?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: insert,
    });
    const payload = await response.json().catch(() => []);
    if (!response.ok) {
      json(res, response.status, { error: payload?.message || "Unable to create person." });
      return;
    }

    json(res, 201, { person: payload[0] || null });
  } catch (error) {
    await handleApiError(res, error);
  }
};
