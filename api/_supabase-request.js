const { isAllowedEmail } = require("./_auth-allowlist");

function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) continue;
    out[rawKey] = decodeURIComponent(rawValue.join("=") || "");
  }
  return out;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    return req.body.trim() ? JSON.parse(req.body) : {};
  }
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  if (buffers.length === 0) return {};
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function getAuthedSupabase(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE
    || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    const error = new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY.");
    error.statusCode = 500;
    throw error;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const accessToken = cookies.sb_access_token || "";
  if (!accessToken) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!userResponse.ok) {
    const error = new Error("Authentication required.");
    error.statusCode = 401;
    throw error;
  }

  const user = await userResponse.json();
  if (!isAllowedEmail(user?.email)) {
    const error = new Error("Access denied.");
    error.statusCode = 403;
    throw error;
  }

  async function supabaseRest(path, options = {}) {
    const method = options.method || "GET";
    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...options.headers,
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    return fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  async function supabaseAdminRest(path, options = {}) {
    if (!supabaseServiceRoleKey) return supabaseRest(path, options);
    const method = options.method || "GET";
    const headers = {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      Accept: "application/json",
      ...options.headers,
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    return fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  }

  return { user, supabaseRest, supabaseAdminRest, hasSupabaseServiceRoleKey: Boolean(supabaseServiceRoleKey) };
}

async function handleApiError(res, error) {
  const statusCode = error.statusCode || 500;
  json(res, statusCode, { error: error.message || "Server error" });
}

module.exports = {
  getAuthedSupabase,
  handleApiError,
  json,
  readJsonBody,
};
