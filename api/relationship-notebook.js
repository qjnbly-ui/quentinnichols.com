const { getAuthedSupabase, handleApiError, json } = require("./_supabase-request");

async function loadTable(supabaseRest, path, errorMessage) {
  const response = await supabaseRest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) {
    const error = new Error(payload?.message || errorMessage);
    error.statusCode = response.status;
    throw error;
  }
  return payload;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabaseRest } = await getAuthedSupabase(req);
    const [people, interactions, memoryCards, reminders] = await Promise.all([
      loadTable(
        supabaseRest,
        "people?select=id,name,preferred_name,photo_url,phone,email,tags,first_met_at,first_met_location,overview,metadata,created_at,updated_at&order=updated_at.desc",
        "Unable to load people."
      ),
      loadTable(
        supabaseRest,
        "person_interactions?select=*&order=occurred_at.desc",
        "Unable to load interactions."
      ),
      loadTable(
        supabaseRest,
        "person_memory_cards?select=*&order=updated_at.desc",
        "Unable to load memory cards."
      ),
      loadTable(
        supabaseRest,
        "person_follow_up_reminders?select=*&order=created_at.desc",
        "Unable to load reminders."
      ),
    ]);

    const peopleById = new Map(people.map((person) => [
      person.id,
      {
        ...person,
        interactions: [],
        memoryCards: [],
        reminders: [],
      },
    ]));

    interactions.forEach((interaction) => {
      peopleById.get(interaction.person_id)?.interactions.push(interaction);
    });

    memoryCards.forEach((card) => {
      peopleById.get(card.person_id)?.memoryCards.push(card);
    });

    reminders.forEach((reminder) => {
      peopleById.get(reminder.person_id)?.reminders.push(reminder);
    });

    json(res, 200, { people: [...peopleById.values()] });
  } catch (error) {
    await handleApiError(res, error);
  }
};
