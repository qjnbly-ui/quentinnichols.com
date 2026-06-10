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

function splitTextForTts(text, maxChunkLength = 190) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const sentences = cleaned.match(/[^.!?]+[.!?]*/g) || [cleaned];
  const chunks = [];
  let buffer = "";

  function pushBuffer() {
    const value = buffer.trim();
    if (value) chunks.push(value);
    buffer = "";
  }

  function pushPiece(piece) {
    const value = String(piece || "").trim();
    if (!value) return;

    if (value.length > maxChunkLength) {
      const words = value.split(/\s+/);
      for (const word of words) {
        const next = buffer ? `${buffer} ${word}` : word;
        if (next.length > maxChunkLength) {
          pushBuffer();
          if (word.length > maxChunkLength) {
            for (let i = 0; i < word.length; i += maxChunkLength) {
              chunks.push(word.slice(i, i + maxChunkLength));
            }
          } else {
            buffer = word;
          }
        } else {
          buffer = next;
        }
      }
      return;
    }

    const next = buffer ? `${buffer} ${value}` : value;
    if (next.length > maxChunkLength) {
      pushBuffer();
      buffer = value;
    } else {
      buffer = next;
    }
  }

  for (const sentence of sentences) {
    pushPiece(sentence);
  }
  pushBuffer();
  return chunks;
}

function getWavDataChunk(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) return null;
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (chunkId === "data" && dataEnd <= buffer.length) {
      return { start: dataStart, end: dataEnd, size: chunkSize };
    }
    offset = dataEnd + (chunkSize % 2);
  }

  return null;
}

function combineWavBuffers(buffers) {
  const validBuffers = buffers.filter((buffer) => Buffer.isBuffer(buffer) && buffer.length > 0);
  if (validBuffers.length <= 1) return validBuffers[0] || Buffer.alloc(0);

  const first = validBuffers[0];
  const firstData = getWavDataChunk(first);
  if (!firstData) return first;

  const dataParts = [];
  for (const buffer of validBuffers) {
    const data = getWavDataChunk(buffer);
    if (!data) return first;
    dataParts.push(buffer.subarray(data.start, data.end));
  }

  const combinedData = Buffer.concat(dataParts);
  const header = Buffer.from(first.subarray(0, firstData.start));
  header.writeUInt32LE(header.length - 8 + combinedData.length, 4);
  header.writeUInt32LE(combinedData.length, firstData.start - 4);
  return Buffer.concat([header, combinedData]);
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

async function callChunkedTts({ apiKey, model, text, voice, speed, responseFormat, maxChunkLength }) {
  const chunks = splitTextForTts(text, maxChunkLength);
  const buffers = [];
  const attempts = [];
  let contentType = "audio/wav";

  for (const chunk of chunks) {
    const result = await callTts({ apiKey, model, text: chunk, voice, speed, responseFormat });
    attempts.push({
      model,
      voice,
      status: result.status,
      contentType: result.contentType || null,
      bytes: result.buffer.length,
      chunkLength: chunk.length,
      details: result.details || null,
    });

    if (!result.ok) {
      return { ok: false, status: result.status, contentType: result.contentType, buffer: result.buffer, details: result.details, attempts };
    }

    contentType = result.contentType || contentType;
    buffers.push(result.buffer);
  }

  return {
    ok: buffers.length > 0,
    status: buffers.length > 0 ? 200 : 400,
    contentType,
    buffer: combineWavBuffers(buffers),
    details: "",
    attempts,
  };
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
    const maxChunkLength = getInt(process.env.TTS_CHUNK_MAX_CHARS, 190, 50, 200);
    const defaultVoice = String(process.env.TTS_VOICE || "troy").trim() || "troy";
    const fallbackVoice = String(process.env.TTS_FALLBACK_VOICE || "hannah").trim() || "hannah";
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
      .update(`${primaryModel}|${voice}|${speed}|${responseFormat}|${maxChunkLength}|${text}`)
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
    const voices = [...new Set([voice, fallbackVoice].filter(Boolean))];
    let winning = null;

    for (const model of modelPlan) {
      for (const candidateVoice of voices) {
        const result = await callChunkedTts({
          apiKey,
          model,
          text,
          voice: candidateVoice,
          speed,
          responseFormat,
          maxChunkLength,
        });

        attempts.push(...(result.attempts || [{
          model,
          voice: candidateVoice,
          status: result.status,
          contentType: result.contentType || null,
          bytes: result.buffer.length,
          details: result.details || null,
        }]));

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