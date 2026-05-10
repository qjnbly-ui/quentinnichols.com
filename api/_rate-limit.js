const buckets = new Map();

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
  if (forwarded) return forwarded.split(",")[0].trim();
  return String(req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown").trim();
}

function enforceRateLimit(req, res, config) {
  const windowMs = Math.max(1_000, Number(config?.windowMs) || 60_000);
  const limit = Math.max(1, Number(config?.limit) || 20);
  const keyPrefix = String(config?.keyPrefix || "api");
  const key = `${keyPrefix}:${getClientIp(req)}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(limit - 1));
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", "0");
    return { allowed: false };
  }

  bucket.count += 1;
  res.setHeader("X-RateLimit-Limit", String(limit));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
  return { allowed: true };
}

module.exports = { enforceRateLimit };
