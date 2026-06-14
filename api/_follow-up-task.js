function cleanText(value, maxLength = 1000) {
  return String(value || "").trim().slice(0, maxLength);
}

function cleanIsoDate(value) {
  const text = cleanText(value, 80);
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

async function readRows(supabaseRest, path) {
  const response = await supabaseRest(path);
  const payload = await response.json().catch(() => []);
  if (!response.ok) return [];
  return Array.isArray(payload) ? payload : [];
}

async function patchReminderMetadata(supabaseRest, reminder, metadata) {
  if (!looksLikeUuid(reminder?.id)) return;
  await supabaseRest(`person_follow_up_reminders?id=eq.${encodeURIComponent(reminder.id)}`, {
    method: "PATCH",
    body: { metadata },
  });
}

function taskRecordForReminder({ userId, reminder, person }) {
  const dueAt = cleanIsoDate(reminder?.remind_at || reminder?.remindAt);
  if (!dueAt) return null;
  const metadata = {
    ...(reminder?.metadata && typeof reminder.metadata === "object" ? reminder.metadata : {}),
    source: "people_follow_up",
    person_id: reminder.person_id || person?.id || "",
    person_name: person?.name || "",
    follow_up_reminder_id: reminder.id || "",
    interaction_id: reminder.interaction_id || "",
  };
  return {
    owner_id: userId,
    title: cleanText(reminder.title, 220),
    description: cleanText(reminder.details, 2000) || null,
    status: reminder.status === "done" ? "done" : reminder.status === "archived" ? "archived" : "todo",
    priority: cleanText(reminder.priority, 20) || "normal",
    due_at: dueAt,
    completed_at: reminder.status === "done" ? new Date().toISOString() : null,
    source: "people_follow_up",
    metadata,
  };
}

async function findLinkedTask(supabaseRest, reminder) {
  const linkedTaskId = cleanText(reminder?.metadata?.linked_task_id, 80);
  if (looksLikeUuid(linkedTaskId)) {
    const rows = await readRows(supabaseRest, `tasks?select=*&id=eq.${encodeURIComponent(linkedTaskId)}&limit=1`);
    if (rows[0]) return rows[0];
  }
  if (!looksLikeUuid(reminder?.id)) return null;
  const rows = await readRows(
    supabaseRest,
    `tasks?select=*&metadata->>follow_up_reminder_id=eq.${encodeURIComponent(reminder.id)}&limit=1`
  );
  return rows[0] || null;
}

async function loadPerson(supabaseRest, personId) {
  if (!looksLikeUuid(personId)) return null;
  const rows = await readRows(supabaseRest, `people?select=id,name&id=eq.${encodeURIComponent(personId)}&limit=1`);
  return rows[0] || null;
}

async function syncFollowUpTask(supabaseRest, userId, reminder, options = {}) {
  if (!reminder || !looksLikeUuid(reminder.id)) return null;
  const person = options.person || await loadPerson(supabaseRest, reminder.person_id);
  const record = taskRecordForReminder({ userId, reminder, person });
  const existingTask = await findLinkedTask(supabaseRest, reminder);

  if (!record) {
    if (existingTask?.id) {
      await supabaseRest(`tasks?id=eq.${encodeURIComponent(existingTask.id)}`, {
        method: "PATCH",
        body: { status: "archived", metadata: { ...(existingTask.metadata || {}), archived_from_people_follow_up: true } },
      });
    }
    return null;
  }

  if (existingTask?.id) {
    const response = await supabaseRest(`tasks?id=eq.${encodeURIComponent(existingTask.id)}&select=*`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: { ...record, owner_id: undefined },
    });
    const payload = await response.json().catch(() => []);
    const task = Array.isArray(payload) ? payload[0] : null;
    if (task?.id && reminder.metadata?.linked_task_id !== task.id) {
      await patchReminderMetadata(supabaseRest, reminder, { ...(reminder.metadata || {}), linked_task_id: task.id });
    }
    return task;
  }

  const response = await supabaseRest("tasks?select=*", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: record,
  });
  const payload = await response.json().catch(() => []);
  const task = Array.isArray(payload) ? payload[0] : null;
  if (task?.id) {
    await patchReminderMetadata(supabaseRest, reminder, { ...(reminder.metadata || {}), linked_task_id: task.id });
  }
  return task;
}

async function deleteLinkedFollowUpTask(supabaseRest, reminder) {
  const existingTask = await findLinkedTask(supabaseRest, reminder);
  if (!existingTask?.id) return;
  await supabaseRest(`tasks?id=eq.${encodeURIComponent(existingTask.id)}`, {
    method: "DELETE",
  });
}

async function syncFollowUpFromTask(supabaseRest, task) {
  const reminderId = cleanText(task?.metadata?.follow_up_reminder_id, 80);
  if (!looksLikeUuid(reminderId)) return null;
  const status = task.status === "done"
    ? "done"
    : task.status === "archived" ? "archived" : "open";
  const response = await supabaseRest(`person_follow_up_reminders?id=eq.${encodeURIComponent(reminderId)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      title: cleanText(task.title, 180),
      details: cleanText(task.description, 1000) || null,
      remind_at: cleanIsoDate(task.due_at) || null,
      status,
      priority: cleanText(task.priority, 20) || "normal",
      metadata: {
        ...(task.metadata || {}),
        linked_task_id: task.id,
        synced_from_task: true,
      },
    },
  });
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload[0] || null : null;
}

async function archiveFollowUpForDeletedTask(supabaseRest, task) {
  const reminderId = cleanText(task?.metadata?.follow_up_reminder_id, 80);
  if (!looksLikeUuid(reminderId)) return null;
  const response = await supabaseRest(`person_follow_up_reminders?id=eq.${encodeURIComponent(reminderId)}&select=*`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: {
      status: "archived",
      metadata: {
        ...(task.metadata || {}),
        linked_task_id: task.id,
        linked_task_deleted: true,
      },
    },
  });
  const payload = await response.json().catch(() => []);
  return Array.isArray(payload) ? payload[0] || null : null;
}

module.exports = {
  syncFollowUpTask,
  deleteLinkedFollowUpTask,
  syncFollowUpFromTask,
  archiveFollowUpForDeletedTask,
};
