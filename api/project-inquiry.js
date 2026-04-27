async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const buffers = [];
  for await (const chunk of req) buffers.push(chunk);
  if (buffers.length === 0) return {};
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitStore = new Map();

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildEmailShell(contentHtml) {
  return `
    <div style="margin:0;padding:32px 16px;background:#050505;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:640px;background:#111111;border:1px solid rgba(255,255,255,0.12);border-radius:24px;overflow:hidden;">
              <tr>
                <td align="center" style="padding:28px 24px 18px;background:linear-gradient(180deg,#131313,#0a0a0a);border-bottom:1px solid rgba(255,255,255,0.08);">
                  <img src="https://www.quentinnichols.com/assets/NEWLOGO.png" alt="Quentin Nichols" width="120" style="display:block;width:120px;max-width:120px;height:auto;margin:0 auto 14px;">
                  <div style="margin-top:8px;font-family:Arial,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#b9ae95;">quentinnichols.com</div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 24px 30px;font-family:Arial,sans-serif;color:#f5f2ea;line-height:1.7;">
                  ${contentHtml}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  `;
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
}

function checkRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = rateLimitStore.get(ip);

  if (!existing || now - existing.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { start: now, count: 1 });
    return null;
  }

  if (existing.count >= RATE_LIMIT_MAX) {
    return Math.ceil((RATE_LIMIT_WINDOW_MS - (now - existing.start)) / 1000);
  }

  existing.count += 1;
  return null;
}

async function sendResendEmail(resendKey, payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "Unable to send email.");
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  try {
    const retryAfter = checkRateLimit(req);
    if (retryAfter !== null) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", String(retryAfter));
      res.end(JSON.stringify({ error: "Too many submissions right now. Please wait a few minutes and try again." }));
      return;
    }

    const body = await readJsonBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim();
    const organization = String(body.organization || body.company || "").trim();
    const budgetTimeline = String(body.budgetTimeline || body.budget || "").trim();
    const sessionType = String(body.sessionType || "").trim();
    const preferredDate = String(body.preferredDate || "").trim();
    const timingNotes = String(body.timingNotes || "").trim();
    const location = String(body.location || "").trim();
    const inquiryType = String(body.inquiryType || "").trim();
    const details = String(body.details || "").trim();
    const source = String(body.source || "Projects page").trim();
    const website = String(body.website || "").trim();
    const isPhotography = inquiryType === "photography";
    const detailsLabel = isPhotography ? "Inquiry details" : "Project details";
    const introLabel = isPhotography ? "New photography inquiry" : "New project inquiry";

    if (website) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!name || !email || !details) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Name, email, and ${detailsLabel.toLowerCase()} are required.` }));
      return;
    }

    if (!isValidEmail(email)) {
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
      res.end(JSON.stringify({ error: "This form is not configured yet. Missing RESEND_API_KEY on the server." }));
      return;
    }

    if (!isValidEmail(toEmail)) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "This form is not configured correctly. RESEND_TO_EMAIL must be a valid email address." }));
      return;
    }

    if (!fromEmail.includes("<") || !fromEmail.includes(">") || !fromEmail.includes("@")) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "This form is not configured correctly. RESEND_FROM_EMAIL should look like Quentin Nichols <no-reply@quentinnichols.com>." }));
      return;
    }

    const detailRows = inquiryType === "photography"
      ? [
          ["Session type", sessionType || "Not provided"],
          ["Preferred date", preferredDate || "Not provided"],
          ["Timing notes", timingNotes || "Not provided"],
          ["Location", location || "Not provided"],
        ]
      : [
          ["Organization", organization || "Not provided"],
          ["Budget or timeline", budgetTimeline || "Not provided"],
        ];

    const subject = `New ${isPhotography ? "photography inquiry" : "project inquiry"} from ${name} (${source})`;
    const detailHtml = detailRows
      .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`)
      .join("");
    const detailText = detailRows
      .map(([label, value]) => `${label}: ${value}`)
      .join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111;">
        <h2 style="margin-bottom: 16px;">${escapeHtml(introLabel)}</h2>
        <p><strong>Source:</strong> ${escapeHtml(source)}</p>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${detailHtml}
        <p><strong>${escapeHtml(detailsLabel)}:</strong></p>
        <p>${escapeHtml(details).replace(/\n/g, "<br>")}</p>
      </div>
    `;

    const text = [
      introLabel,
      `Source: ${source}`,
      `Name: ${name}`,
      `Email: ${email}`,
      detailText,
      "",
      `${detailsLabel}:`,
      details,
    ].join("\n");

    await Promise.all([
      sendResendEmail(resendKey, {
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject,
        html,
        text,
      }),
      sendResendEmail(resendKey, {
        from: fromEmail,
        to: [email],
        subject: `We received your ${inquiryType === "photography" ? "photography inquiry" : "project request"}`,
        html: buildEmailShell(`
          <div style="font-size:24px;line-height:1.2;font-family:Georgia,serif;margin:0 0 16px;">Thanks, ${escapeHtml(name)}.</div>
          <p style="margin:0 0 14px;font-size:15px;color:#d6d0c4;">I received your ${escapeHtml(inquiryType === "photography" ? "photography inquiry" : "project request")} and will follow up as soon as I can.</p>
          <p style="margin:0 0 18px;font-size:15px;color:#d6d0c4;">If you want to reach me directly, you can email or call anytime.</p>
          <table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0 20px;">
            <tr>
              <td style="padding:0 10px 10px 0;">
                <a href="mailto:${escapeHtml(toEmail)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#f5f2ea;color:#111111;text-decoration:none;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-family:Arial,sans-serif;">Email Quentin</a>
              </td>
              <td style="padding:0 0 10px 0;">
                <a href="tel:+15419040421" style="display:inline-block;padding:12px 18px;border-radius:999px;border:1px solid rgba(245,242,234,0.24);color:#f5f2ea;text-decoration:none;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-family:Arial,sans-serif;">Call Quentin</a>
              </td>
            </tr>
          </table>
          <div style="padding:16px 18px;border-radius:18px;border:1px solid rgba(245,242,234,0.12);background:rgba(255,255,255,0.03);">
            <div style="font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#b9ae95;margin:0 0 8px;font-family:Arial,sans-serif;">What Happens Next</div>
            <div style="font-size:14px;color:#d6d0c4;">I’ll review your message and reach back out with next steps, questions, or availability.</div>
          </div>
        `),
        text: [
          `Thanks, ${name}.`,
          `I received your ${inquiryType === "photography" ? "photography inquiry" : "project request"} and will follow up as soon as I can.`,
          `You can also email ${toEmail} or call (541) 904-0421.`,
        ].join("\n\n"),
      }),
    ]);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
  } catch (error) {
    const message = error.message || "Server error";
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: message.includes("resend") || message.includes("domain") ? "Email delivery is not configured correctly yet. Check your Resend sender/domain setup." : message }));
  }
};
