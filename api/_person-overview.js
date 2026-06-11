function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

async function loadRows(supabaseRest, path, errorMessage) {
  const response = await supabaseRest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || errorMessage);
    error.statusCode = response.status;
    throw error;
  }
  return Array.isArray(payload) ? payload : [];
}

function firstSentence(value, maxLength = 260) {
  const text = cleanText(value, maxLength).replace(/\s+/g, " ");
  if (!text) return "";
  const sentence = text.split(/(?<=[.!?])\s+/).find(Boolean) || text;
  return cleanText(sentence, maxLength);
}

function cleanMemoryLine(card) {
  const label = cleanText(card.label, 80);
  const value = cleanText(card.value, 260);
  if (!label || !value) return "";
  return `${label}: ${value}`;
}

function buildProfileOverview(person, interactions, memoryCards) {
  const name = cleanText(person?.name, 160) || "This person";
  const preferred = cleanText(person?.preferred_name, 160);
  const tags = Array.isArray(person?.tags) ? person.tags.map((tag) => cleanText(tag, 48)).filter(Boolean) : [];
  const topMemories = memoryCards
    .filter((card) => String(card.label || "").trim().toLowerCase() !== "raw note")
    .map(cleanMemoryLine)
    .filter(Boolean)
    .slice(0, 8);
  const topicList = [...new Set(interactions.flatMap((interaction) => (
    Array.isArray(interaction.topics) ? interaction.topics : []
  )).map((topic) => cleanText(topic, 48)).filter(Boolean))].slice(0, 8);
  const recentNotes = interactions
    .slice(0, 5)
    .map((interaction) => firstSentence(interaction.ai_summary || interaction.notes, 220))
    .filter(Boolean);

  const identityBits = [];
  if (preferred && preferred !== name) identityBits.push(`goes by ${preferred}`);
  if (tags.length) identityBits.push(`tagged ${tags.join(", ")}`);

  const sentences = [];
  sentences.push(identityBits.length ? `${name} ${identityBits.join(" and ")}.` : `${name} is a profile in your people notebook.`);
  if (topMemories.length) {
    sentences.push(`Key memory: ${topMemories.join("; ")}.`);
  }
  if (topicList.length) {
    sentences.push(`Your notes around this profile touch on ${topicList.join(", ")}.`);
  }
  if (recentNotes.length) {
    sentences.push(`Recent context: ${recentNotes.join(" ")}`);
  }

  return cleanText(sentences.join(" ").replace(/\s+/g, " "), 2000);
}

async function rebuildPersonOverview(supabaseRest, personId) {
  const encodedPersonId = encodeURIComponent(personId);
  const [people, interactions, memoryCards] = await Promise.all([
    loadRows(
      supabaseRest,
      `people?select=id,name,preferred_name,tags&limit=1&id=eq.${encodedPersonId}`,
      "Unable to load person."
    ),
    loadRows(
      supabaseRest,
      `person_interactions?select=id,notes,topics,ai_summary,occurred_at&person_id=eq.${encodedPersonId}&order=occurred_at.desc&limit=40`,
      "Unable to load interactions."
    ),
    loadRows(
      supabaseRest,
      `person_memory_cards?select=id,label,value,confidence,updated_at&person_id=eq.${encodedPersonId}&order=updated_at.desc&limit=80`,
      "Unable to load memory cards."
    ),
  ]);
  const overview = buildProfileOverview(people[0], interactions, memoryCards);
  if (!overview) return "";
  const response = await supabaseRest(`people?id=eq.${encodedPersonId}`, {
    method: "PATCH",
    body: { overview },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || "Unable to update profile overview.");
    error.statusCode = response.status;
    throw error;
  }
  return overview;
}

module.exports = {
  rebuildPersonOverview,
};
