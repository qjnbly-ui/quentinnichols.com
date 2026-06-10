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

module.exports = async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
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

    const body = await readJsonBody(req);
    const name = cleanText(body.name, 160);
    if (!name) {
      json(res, 400, { error: "Name is required." });
      return;
    }

    const insert = {
      owner_id: user.id,
      name,
      preferred_name: cleanText(body.preferredName || body.preferred_name, 160) || null,
      photo_url: cleanText(body.photoUrl || body.photo_url, 1000) || null,
      phone: cleanText(body.phone, 80) || null,
      email: cleanText(body.email, 160) || null,
      tags: cleanTags(body.tags),
      first_met_location: cleanText(body.firstMetLocation || body.first_met_location, 240) || null,
      overview: cleanText(body.overview, 2000) || null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
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
