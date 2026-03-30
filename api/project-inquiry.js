async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  if (buffers.length === 0) return {};
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const company = String(body.company || "").trim();
    const budget = String(body.budget || "").trim();
    const details = String(body.details || "").trim();
    const website = String(body.website || "").trim();

    if (website) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!name || !email || !details) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Name, email, and project details are required." }));
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Enter a valid email address." }));
      return;
    }

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || "Project Inquiry <onboarding@resend.dev>";
    const toEmail = process.env.RESEND_TO_EMAIL || "quentin@quentinnichols.com";

    if (!resendKey) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Missing RESEND_API_KEY." }));
      return;
    }

    const subject = `New project inquiry from ${name}`;
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2 style="margin-bottom: 16px;">New project inquiry</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Organization:</strong> ${escapeHtml(company || "Not provided")}</p>
        <p><strong>Budget or timeline:</strong> ${escapeHtml(budget || "Not provided")}</p>
        <p><strong>Project details:</strong></p>
        <p>${escapeHtml(details).replace(/\n/g, "<br>")}</p>
      </div>
    `;

    const text = [
      "New project inquiry",
      `Name: ${name}`,
      `Email: ${email}`,
      `Organization: ${company || "Not provided"}`,
      `Budget or timeline: ${budget || "Not provided"}`,
      "",
      "Project details:",
      details,
    ].join("\n");

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: errorText || "Unable to send inquiry." }));
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message || "Server error" }));
  }
};
