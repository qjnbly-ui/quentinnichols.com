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

function cookie(name, value, maxAgeSeconds) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ].join("; ");
}

function clearCookie(name) {
  return [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}

async function fetchUser(supabaseUrl, supabaseAnonKey, accessToken) {
  return fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function refreshSession(supabaseUrl, supabaseAnonKey, refreshToken) {
  return fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_ANON_KEY." }));
    return;
  }

  const cookies = parseCookies(req.headers.cookie || "");
  const accessToken = cookies.sb_access_token || "";
  const refreshToken = cookies.sb_refresh_token || "";

  const unauthenticated = () => {
    res.setHeader("Set-Cookie", [clearCookie("sb_access_token"), clearCookie("sb_refresh_token")]);
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ session: null }));
  };

  try {
    if (!accessToken) {
      unauthenticated();
      return;
    }

    let userResponse = await fetchUser(supabaseUrl, supabaseAnonKey, accessToken);
    if (userResponse.ok) {
      const user = await userResponse.json();
      if (!isAllowedEmail(user?.email)) {
        unauthenticated();
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ session: { user } }));
      return;
    }

    if (!refreshToken) {
      unauthenticated();
      return;
    }

    const refreshResponse = await refreshSession(supabaseUrl, supabaseAnonKey, refreshToken);
    const refreshPayload = await refreshResponse.json().catch(() => ({}));
    if (!refreshResponse.ok || !refreshPayload?.access_token || !refreshPayload?.refresh_token) {
      unauthenticated();
      return;
    }

    const newAccess = refreshPayload.access_token;
    const newRefresh = refreshPayload.refresh_token;
    const accessMaxAge = Number(refreshPayload.expires_in || 3600);
    const refreshMaxAge = 60 * 60 * 24 * 30;

    userResponse = await fetchUser(supabaseUrl, supabaseAnonKey, newAccess);
    if (!userResponse.ok) {
      unauthenticated();
      return;
    }

    const user = await userResponse.json();
    if (!isAllowedEmail(user?.email)) {
      unauthenticated();
      return;
    }
    res.setHeader("Set-Cookie", [
      cookie("sb_access_token", newAccess, accessMaxAge),
      cookie("sb_refresh_token", newRefresh, refreshMaxAge),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ session: { user } }));
  } catch (_error) {
    unauthenticated();
  }
};
