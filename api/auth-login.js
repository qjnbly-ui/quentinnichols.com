function parseJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }

    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        if (chunks.length === 0) {
          resolve({});
          return;
        }
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
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

  try {
    const body = await parseJson(req);
    const email = String(body.email || "").trim();
    const password = String(body.password || "");
    if (!email || !password) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Email and password are required." }));
      return;
    }

    const upstream = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ email, password }),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok || !payload?.access_token || !payload?.refresh_token) {
      res.statusCode = upstream.status || 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: payload?.msg || payload?.error_description || payload?.error || "Login failed." }));
      return;
    }

    const accessMaxAge = Number(payload.expires_in || 3600);
    const refreshMaxAge = 60 * 60 * 24 * 30;
    res.setHeader("Set-Cookie", [
      cookie("sb_access_token", payload.access_token, accessMaxAge),
      cookie("sb_refresh_token", payload.refresh_token, refreshMaxAge),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ user: payload.user || null }));
  } catch (_error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Server error." }));
  }
};
