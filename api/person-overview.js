const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");
const { rebuildPersonOverview } = require("./_person-overview");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabaseRest } = await getAuthedSupabase(req);
    const body = await readJsonBody(req);
    const personId = cleanText(body.personId || body.person_id, 80);
    if (!looksLikeUuid(personId)) {
      json(res, 400, { error: "A valid person is required." });
      return;
    }

    const overview = await rebuildPersonOverview(supabaseRest, personId);
    json(res, 200, { overview });
  } catch (error) {
    await handleApiError(res, error);
  }
};
