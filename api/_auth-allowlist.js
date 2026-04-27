function getAllowedEmails() {
  const raw = process.env.ALLOWED_PORTAL_EMAILS || "quentin@quentinnichols.com";
  return new Set(
    raw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isAllowedEmail(value) {
  const allowed = getAllowedEmails();
  return allowed.has(normalizeEmail(value));
}

module.exports = {
  getAllowedEmails,
  normalizeEmail,
  isAllowedEmail,
};
