const MODEL = "llama-3.3-70b-versatile";

function buildSystemPrompt(pageContext) {
  return `You are a focused guide for Earth School: The Earth Experience Guide.

Use only the Earth School content provided below. Do not answer from general knowledge unless the user explicitly asks you to step outside the document.

Earth School content:
${pageContext}

Instructions:
- Answer as a careful reader of this document.
- Stay grounded in the document's structure, language, and internal logic.
- Help connect sections, themes, and repeated ideas.
- If the answer is not in the provided content, say so plainly.
- Prefer concise, thoughtful prose over bullet lists unless the user asks for a list.
- Do not invent citations or outside claims.`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Missing API key on server" });
    return;
  }

  try {
    const { messages, context } = req.body || {};
    if (!Array.isArray(messages) || typeof context !== "string" || !context.trim()) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    const trimmedMessages = messages
      .filter((msg) => msg && typeof msg.content === "string")
      .slice(-10);

    const payload = {
      model: MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(context.trim()) },
        ...trimmedMessages,
      ],
      temperature: 0.7,
      max_tokens: 1200,
      stream: false,
    };

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(502).json({ error: "Upstream error", detail: errorText });
      return;
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || "";
    res.status(200).json({ reply });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
