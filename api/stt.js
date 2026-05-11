async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  if (!buffers.length) return {};
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const audioBase64 = String(body.audio || "");
    const mimeType = String(body.mimeType || "audio/webm");
    const language = String(body.language || "en").trim();

    if (!audioBase64) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing audio" }));
      return;
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing GROQ_API_KEY" }));
      return;
    }

    const audioBuffer = Buffer.from(audioBase64, "base64");
    if (!audioBuffer.length) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Invalid audio payload" }));
      return;
    }

    const formData = new FormData();
    const fileExt = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
    const fileName = `speech.${fileExt}`;
    formData.append("file", new Blob([audioBuffer], { type: mimeType }), fileName);
    formData.append("model", process.env.STT_MODEL || "whisper-large-v3");
    formData.append("temperature", "0");
    formData.append("response_format", "json");
    formData.append("language", language || "en");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: errorText || "Transcription failed" }));
      return;
    }

    const data = await response.json();
    const text = String(data?.text || "").trim();
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ text }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Server error" }));
  }
};
