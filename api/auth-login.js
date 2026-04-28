const { isAllowedEmail } = require("./_auth-allowlist");

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

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded !== "string" || !forwarded.trim()) return "";
  return forwarded.split(",")[0].trim();
}

async function verifyTurnstile(captchaToken, req) {
  const secret = String(process.env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) {
    return { ok: false, error: "Missing TURNSTILE_SECRET_KEY." };
  }
  if (!captchaToken) {
    return { ok: false, error: "Complete the security check first." };
  }

  const payload = new URLSearchParams();
  payload.set("secret", secret);
  payload.set("response", captchaToken);
  const remoteIp = getClientIp(req);
  if (remoteIp) payload.set("remoteip", remoteIp);

  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString(),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success) {
      const codes = Array.isArray(result?.["error-codes"]) ? result["error-codes"].join(", ") : "";
      return {
        ok: false,
        error: codes ? `Captcha verification failed: ${codes}.` : "Captcha verification failed.",
      };
    }
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: "Captcha verification request failed." };
  }
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
    const captchaToken = String(body.captchaToken || "").trim();

    if (!email || !password) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Email and password are required." }));
      return;
    }

    const captchaResult = await verifyTurnstile(captchaToken, req);
    if (!captchaResult.ok) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: captchaResult.error }));
      return;
    }

    const upstream = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const raw = await upstream.text().catch(() => "");
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      payload = {};
    }
    if (!upstream.ok || !payload?.access_token || !payload?.refresh_token) {
      const upstreamError =
        payload?.msg ||
        payload?.error_description ||
        payload?.error ||
        payload?.message ||
        (raw && raw.trim() ? raw.trim() : "") ||
        `Login failed (${upstream.status || 401}).`;
      res.statusCode = upstream.status || 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: upstreamError }));
      return;
    }

    const authenticatedEmail = payload?.user?.email || "";
    if (!isAllowedEmail(authenticatedEmail)) {
      res.statusCode = 403;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "This account is not authorized for portal access." }));
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
