const { getAuthedSupabase, handleApiError, json, readJsonBody } = require("./_supabase-request");
const { rebuildPersonOverview } = require("./_person-overview");

function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function cleanRecordId(value) {
  const id = cleanText(value, 80);
  if (looksLikeUuid(id) || /^\d+$/.test(id)) return id;
  return "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabaseRest } = await getAuthedSupabase(req);
    const requestUrl = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const body = await readJsonBody(req);
    const personId = cleanRecordId(
      body.personId
        || body.person_id
        || body.id
        || requestUrl.searchParams.get("person_id")
        || requestUrl.searchParams.get("id"),
    );
    if (!personId) {
      json(res, 400, { error: "A valid person is required." });
      return;
    }

    const overview = await rebuildPersonOverview(supabaseRest, personId);
    json(res, 200, { overview });
  } catch (error) {
    await handleApiError(res, error);
  }
};
