const crypto = require("crypto");
const { enforceRateLimit } = require("./_rate-limit");

const ttsCache = new Map();

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  if (buffers.length === 0) return {};
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

function getFloat(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function getInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function getEnvList(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function looksLikeAudio(buffer, contentType) {
  const isWav =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE";
  return buffer.length > 0 && (isWav || String(contentType || "").toLowerCase().includes("audio"));
}

function cleanCache(maxEntries, ttlMs) {
  const now = Date.now();
  for (const [key, entry] of ttsCache) {
    if (entry.expiresAt <= now) ttsCache.delete(key);
  }
  while (ttsCache.size > maxEntries) {
    const oldestKey = ttsCache.keys().next().value;
    if (!oldestKey) break;
    ttsCache.delete(oldestKey);
  }
}

async function callTts({ apiKey, model, text, voice, speed, responseFormat }) {
  const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      speed,
      response_format: responseFormat,
    }),
  });

  const contentType = String(response.headers.get("content-type") || "");
  const buffer = Buffer.from(await response.arrayBuffer());
  const details = !response.ok || !looksLikeAudio(buffer, contentType) ? buffer.toString("utf8").slice(0, 500) : "";
  return { ok: response.ok && looksLikeAudio(buffer, contentType), status: response.status, contentType, buffer, details };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const ttsRate = enforceRateLimit(req, res, {
    keyPrefix: "tts",
    windowMs: Number(process.env.TTS_RATE_LIMIT_WINDOW_MS || 60_000),
    limit: Number(process.env.TTS_RATE_LIMIT_MAX || 30),
  });
  if (!ttsRate.allowed) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const text = String(body.text || "").trim().slice(0, getInt(process.env.TTS_MAX_CHARS, 1200, 120, 4000));
    const speed = getFloat(body.speed ?? process.env.TTS_SPEED ?? 1.15, 1.15, 0.5, 5);
    const responseFormat = String(process.env.TTS_RESPONSE_FORMAT || "wav").trim() || "wav";
    const defaultVoice = String(process.env.TTS_VOICE || "tara").trim() || "tara";
    const fallbackVoice = String(process.env.TTS_FALLBACK_VOICE || "troy").trim() || "troy";
    const voice = String(body.voice || defaultVoice).trim() || defaultVoice;
    const primaryModel = String(process.env.TTS_MODEL || "canopylabs/orpheus-v1-english").trim();
    const fallbackModels = getEnvList(process.env.TTS_FALLBACK_MODELS);
    const modelPlan = [primaryModel, ...fallbackModels].filter(Boolean);

    if (!text) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing text" }));
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing GROQ_API_KEY" }));
      return;
    }

    const cacheEnabled = String(process.env.TTS_CACHE_ENABLED || "true").toLowerCase() !== "false";
    const cacheTtlMs = getInt(process.env.TTS_CACHE_TTL_MS, 24 * 60 * 60 * 1000, 1_000, 7 * 24 * 60 * 60 * 1000);
    const cacheMaxEntries = getInt(process.env.TTS_CACHE_MAX_ENTRIES, 200, 10, 5_000);
    const hash = crypto
      .createHash("sha256")
      .update(`${primaryModel}|${voice}|${speed}|${responseFormat}|${text}`)
      .digest("hex");

    if (cacheEnabled) {
      cleanCache(cacheMaxEntries, cacheTtlMs);
      const hit = ttsCache.get(hash);
      if (hit && hit.expiresAt > Date.now()) {
        res.statusCode = 200;
        res.setHeader("Content-Type", hit.contentType || "audio/wav");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-TTS-Source", "cache");
        res.setHeader("X-TTS-Model", hit.model || primaryModel);
        res.setHeader("X-TTS-Voice", hit.voice || voice);
        res.end(hit.buffer);
        return;
      }
    }

    const attempts = [];
    const voices = [voice, fallbackVoice];
    let winning = null;

    for (const model of modelPlan) {
      for (const candidateVoice of voices) {
        const result = await callTts({
          apiKey,
          model,
          text,
          voice: candidateVoice,
          speed,
          responseFormat,
        });

        attempts.push({
          model,
          voice: candidateVoice,
          status: result.status,
          contentType: result.contentType || null,
          bytes: result.buffer.length,
          details: result.details || null,
        });

        if (result.ok) {
          winning = { ...result, model, voice: candidateVoice };
          break;
        }
      }
      if (winning) break;
    }

    if (!winning) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "TTS provider returned no playable audio", attempts }));
      return;
    }

    if (cacheEnabled) {
      ttsCache.set(hash, {
        model: winning.model,
        voice: winning.voice,
        contentType: winning.contentType || "audio/wav",
        buffer: winning.buffer,
        expiresAt: Date.now() + cacheTtlMs,
      });
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", winning.contentType || "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-TTS-Source", winning.model === primaryModel && winning.voice === voice ? "upstream-primary" : "upstream-fallback");
    res.setHeader("X-TTS-Model", winning.model);
    res.setHeader("X-TTS-Voice", winning.voice);
    res.end(winning.buffer);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Server error" }));
  }
};
