const PROTECTED_PATHS = ["/portal", "/ai", "/api/ask", "/api/tts", "/api/stt", "/api/voice"];

function getAllowedEmails() {
  const raw = process.env.ALLOWED_PORTAL_EMAILS || "quentin@quentinnichols.com";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isAllowedEmail(value) {
  const allowed = getAllowedEmails();
  return allowed.has(normalizeEmail(value));
}

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

function serializeCookie(name, value, maxAgeSeconds) {
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

function isProtected(pathname) {
  const normalizedPathname = String(pathname || "").toLowerCase();
  return PROTECTED_PATHS.some(
    (prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`)
  );
}

function loginRedirect(requestUrl) {
  const loginUrl = new URL("/login/", requestUrl);
  loginUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
  return Response.redirect(loginUrl, 307);
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

export default async function middleware(request) {
  const requestUrl = new URL(request.url);
  if (!isProtected(requestUrl.pathname)) {
    return fetch(request);
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json({ error: "Missing auth env configuration." }, { status: 500 });
  }

  const cookies = parseCookies(request.headers.get("cookie") || "");
  const accessToken = cookies.sb_access_token || "";
  const refreshToken = cookies.sb_refresh_token || "";
  if (!accessToken) {
    return loginRedirect(requestUrl);
  }

  try {
    const userResponse = await fetchUser(supabaseUrl, supabaseAnonKey, accessToken);
    if (userResponse.ok) {
      const user = await userResponse.json().catch(() => null);
      if (!isAllowedEmail(user?.email)) {
        const denied = loginRedirect(requestUrl);
        denied.headers.append("Set-Cookie", clearCookie("sb_access_token"));
        denied.headers.append("Set-Cookie", clearCookie("sb_refresh_token"));
        return denied;
      }
      return fetch(request);
    }

    if (!refreshToken) {
      return loginRedirect(requestUrl);
    }

    const refreshResponse = await refreshSession(supabaseUrl, supabaseAnonKey, refreshToken);
    const refreshPayload = await refreshResponse.json().catch(() => ({}));
    if (!refreshResponse.ok || !refreshPayload?.access_token || !refreshPayload?.refresh_token) {
      return loginRedirect(requestUrl);
    }

    const freshUser = await fetchUser(supabaseUrl, supabaseAnonKey, refreshPayload.access_token);
    if (!freshUser.ok) {
      return loginRedirect(requestUrl);
    }

    const user = await freshUser.json().catch(() => null);
    if (!isAllowedEmail(user?.email)) {
      const denied = loginRedirect(requestUrl);
      denied.headers.append("Set-Cookie", clearCookie("sb_access_token"));
      denied.headers.append("Set-Cookie", clearCookie("sb_refresh_token"));
      return denied;
    }

    const response = await fetch(request);
    response.headers.append(
      "Set-Cookie",
      serializeCookie("sb_access_token", refreshPayload.access_token, Number(refreshPayload.expires_in || 3600))
    );
    response.headers.append(
      "Set-Cookie",
      serializeCookie("sb_refresh_token", refreshPayload.refresh_token, 60 * 60 * 24 * 30)
    );
    return response;
  } catch (_error) {
    const response = loginRedirect(requestUrl);
    response.headers.append("Set-Cookie", clearCookie("sb_access_token"));
    response.headers.append("Set-Cookie", clearCookie("sb_refresh_token"));
    return response;
  }
}
