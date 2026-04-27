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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const cookies = parseCookies(req.headers.cookie || "");
  const accessToken = cookies.sb_access_token || "";

  if (supabaseUrl && supabaseAnonKey && accessToken) {
    try {
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (_error) {
      // Best effort: clear local auth cookies even if upstream logout fails.
    }
  }

  res.setHeader("Set-Cookie", [
    clearCookie("sb_access_token"),
    clearCookie("sb_refresh_token"),
  ]);
  res.setHeader("Cache-Control", "no-store");
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ success: true }));
};
