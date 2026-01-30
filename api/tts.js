async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  if (buffers.length === 0) return {};
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
    const text = String(body.text || "").trim();
    const voice = String(body.voice || "troy").trim();
    const model = "canopylabs/orpheus-v1-english";
    const speedInput = body.speed ?? process.env.TTS_SPEED ?? 1.15;
    const speedNumber = Number(speedInput);
    const speed = Number.isFinite(speedNumber) ? Math.min(5, Math.max(0.5, speedNumber)) : 1.15;

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

    const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 1200),
        voice,
        speed,
        response_format: "wav",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: errorText || "TTS request failed" }));
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "audio/wav");
    res.end(buffer);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Server error" }));
  }
};
