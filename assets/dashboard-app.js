(() => {
  const authGate = document.getElementById("qappAuthGate");
  const authMessage = document.getElementById("qappAuthMessage");
  const shell = document.getElementById("qappShell");
  const view = document.getElementById("qappView");
  const screenTitle = document.getElementById("qappScreenTitle");
  const menuButton = document.getElementById("qappMenuButton");
  const drawer = document.getElementById("qappDrawer");
  const drawerOverlay = document.getElementById("qappDrawerOverlay");
  const drawerEmail = document.getElementById("qappDrawerEmail");
  const logoutButton = document.getElementById("qappLogoutButton");
  const routeButtons = [...document.querySelectorAll("[data-route]")];

  const routeTitles = {
    today: "Today",
    people: "People Notebook",
    calendar: "Calendar",
    tasks: "Tasks",
    notes: "Notes",
    ai: "AI Assistant",
    inquiries: "Inquiries",
  };

  let currentRoute = "today";
  let notebook = { people: [] };
  let notebookStatus = "loading";
  let notebookError = "";
  let peopleSearch = "";
  let selectedPersonId = "";
  let peopleMode = "list";
  let relationshipCaptureNote = "";
  let relationshipDraft = null;
  let relationshipDraftStatus = "idle";
  let relationshipDraftError = "";
  let calendarEvents = [];
  let calendarStatus = "idle";
  let calendarError = "";
  let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let selectedCalendarDate = toDateKey(new Date());
  let calendarMode = "month";
  let editingCalendarEventId = "";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function openDrawer() {
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    drawerOverlay.hidden = false;
    document.body.classList.add("qapp-drawer-open");
    menuButton.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    drawerOverlay.hidden = true;
    document.body.classList.remove("qapp-drawer-open");
    menuButton.setAttribute("aria-expanded", "false");
  }

  function setRoute(route) {
    currentRoute = routeTitles[route] ? route : "today";
    if (currentRoute !== "people") {
      peopleMode = "list";
      selectedPersonId = "";
      relationshipCaptureNote = "";
      relationshipDraft = null;
      relationshipDraftStatus = "idle";
      relationshipDraftError = "";
    }
    screenTitle.textContent = routeTitles[currentRoute];
    routeButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.route === currentRoute);
    });
    closeDrawer();
    render();
    if (currentRoute === "calendar" && calendarStatus === "idle") {
      loadCalendarData();
    }
  }

  function statusPill(label) {
    return `<span class="qapp-pill">${escapeHtml(label)}</span>`;
  }

  function firstSentence(value, maxLength = 220) {
    const text = String(value || "").trim().replace(/\s+/g, " ");
    if (!text) return "";
    const sentence = text.split(/[.!?]/).find(Boolean) || text;
    const cleanSentence = sentence.trim();
    return cleanSentence.length > maxLength ? `${cleanSentence.slice(0, maxLength).trim()}...` : cleanSentence;
  }

  function isRawNoteMemory(card) {
    return String(card?.label || "").trim().toLowerCase() === "raw note";
  }

  function buildProfileOverview({ manualOverview, existingOverview, note, draftSummary, forceUpdate = false }) {
    const manual = String(manualOverview || "").trim();
    if (manual) return manual.slice(0, 500);

    const existing = String(existingOverview || "").trim();
    const summary = firstSentence(draftSummary || note, 220);
    if (!summary) return existing;

    const existingLooksRaw = existing.length > 260 || existing.includes(String(note || "").slice(0, 80));
    if (!existing || existingLooksRaw || forceUpdate) return summary;
    return existing;
  }

  function formatDate(value, fallback = "Recent") {
    if (!value) return fallback;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return fallback;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(value, fallback = "Recent") {
    if (!value) return fallback;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return fallback;
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function toDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateFromKey(value) {
    const [year, month, day] = String(value || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    const date = new Date(year, month - 1, day);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function formatDateKey(value, fallback = "Selected day") {
    const date = dateFromKey(value);
    if (!date) return fallback;
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function monthLabel(date) {
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function formatEventTime(event) {
    if (event.all_day) return "All day";
    const startsAt = new Date(event.starts_at);
    const endsAt = event.ends_at ? new Date(event.ends_at) : null;
    if (!Number.isFinite(startsAt.getTime())) return "Time not set";
    const start = startsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (!endsAt || !Number.isFinite(endsAt.getTime())) return start;
    return `${start} - ${endsAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }

  function toDateTimeLocal(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  }

  function fromDateTimeLocal(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    const date = new Date(text);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }

  async function apiJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "Request failed.");
    }
    return payload;
  }

  function qappModal({ title = "Confirm", message = "", fields = [], confirmLabel = "OK", cancelLabel = "Cancel", danger = false, showCancel = true } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "qapp-modal-overlay";
      overlay.innerHTML = `
        <section class="qapp-modal" role="dialog" aria-modal="true" aria-labelledby="qappModalTitle">
          <div class="qapp-modal-header">
            <h2 id="qappModalTitle">${escapeHtml(title)}</h2>
            ${message ? `<p>${escapeHtml(message)}</p>` : ""}
          </div>
          ${fields.length ? `
            <div class="qapp-modal-fields">
              ${fields.map((field, index) => `
                <label>
                  <span>${escapeHtml(field.label || "Value")}</span>
                  ${field.type === "textarea"
                    ? `<textarea data-modal-field="${index}" rows="${field.rows || 4}">${escapeHtml(field.value || "")}</textarea>`
                    : `<input data-modal-field="${index}" type="${escapeHtml(field.type || "text")}" value="${escapeHtml(field.value || "")}">`}
                </label>
              `).join("")}
            </div>
          ` : ""}
          <div class="qapp-modal-actions">
            ${showCancel ? `<button class="qapp-modal-cancel" type="button">${escapeHtml(cancelLabel)}</button>` : ""}
            <button class="qapp-modal-confirm ${danger ? "is-danger" : ""}" type="button">${escapeHtml(confirmLabel)}</button>
          </div>
        </section>
      `;

      function close(result) {
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        resolve(result);
      }

      function readValues() {
        return fields.map((field, index) => {
          const input = overlay.querySelector(`[data-modal-field="${index}"]`);
          return field.trim === false ? input?.value || "" : String(input?.value || "").trim();
        });
      }

      function onKeydown(event) {
        if (event.key === "Escape") close(null);
        if (event.key === "Enter" && !event.shiftKey && fields.length <= 1) {
          event.preventDefault();
          close(fields.length ? readValues()[0] : true);
        }
      }

      overlay.querySelector(".qapp-modal-cancel")?.addEventListener("click", () => close(null));
      overlay.querySelector(".qapp-modal-confirm").addEventListener("click", () => close(fields.length ? readValues() : true));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close(null);
      });
      document.addEventListener("keydown", onKeydown);
      document.body.appendChild(overlay);
      const firstField = overlay.querySelector("[data-modal-field]");
      const confirmButton = overlay.querySelector(".qapp-modal-confirm");
      setTimeout(() => (firstField || confirmButton)?.focus(), 0);
    });
  }

  function qappAlert(message, title = "Notice") {
    return qappModal({ title, message, confirmLabel: "OK", showCancel: false });
  }

  function qappConfirm(message, title = "Confirm", options = {}) {
    return qappModal({
      title,
      message,
      confirmLabel: options.confirmLabel || "Confirm",
      cancelLabel: options.cancelLabel || "Cancel",
      danger: Boolean(options.danger),
    });
  }

  async function qappPrompt(label, value = "", options = {}) {
    const result = await qappModal({
      title: options.title || label,
      fields: [{ label, value, type: options.type || "text", rows: options.rows, trim: options.trim }],
      confirmLabel: options.confirmLabel || "Save",
      cancelLabel: options.cancelLabel || "Cancel",
    });
    return Array.isArray(result) ? result[0] : result;
  }

  function normalizePerson(person) {
    const memoryCards = Array.isArray(person.memoryCards) ? person.memoryCards : [];
    const reminders = Array.isArray(person.reminders) ? person.reminders : [];
    const interactions = Array.isArray(person.interactions) ? person.interactions : [];
    return {
      ...person,
      summary: person.overview || person.summary || "No overview yet.",
      tags: Array.isArray(person.tags) ? person.tags : [],
      memoryCards: memoryCards
        .filter((card) => !isRawNoteMemory(card))
        .map((card) => ({
          id: card.id || "",
          category: card.category || "general",
          label: card.label || card.category || "Memory",
          value: card.value || "",
        })),
      reminders: reminders.map((reminder) => ({
        id: reminder.id || "",
        title: reminder.title || "Follow up",
        details: reminder.details || "",
        status: reminder.status || "open",
        priority: reminder.priority || "normal",
        remind_at: reminder.remind_at || "",
        due: reminder.remind_at ? formatDate(reminder.remind_at, "Scheduled") : "Soon",
      })),
      interactions: interactions.map((interaction) => ({
        id: interaction.id || "",
        occurred_at: interaction.occurred_at || "",
        date: formatDateTime(interaction.occurred_at),
        location: interaction.location || "Not specified",
        mood: interaction.mood || "",
        notes: interaction.notes || interaction.ai_summary || "",
        topics: Array.isArray(interaction.topics) ? interaction.topics : [],
      })),
    };
  }

  async function loadNotebookData() {
    notebookStatus = "loading";
    notebookError = "";
    render();
    try {
      const payload = await apiJson("/api/relationship-notebook");
      notebook = {
        people: Array.isArray(payload.people) ? payload.people.map(normalizePerson) : [],
      };
      notebookStatus = "ready";
    } catch (error) {
      notebookStatus = "error";
      notebookError = error?.message || "Unable to load notebook.";
    }
    render();
  }

  async function loadCalendarData() {
    calendarStatus = "loading";
    calendarError = "";
    render();
    try {
      const start = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1).toISOString();
      const end = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 2, 0, 23, 59, 59).toISOString();
      const payload = await apiJson(`/api/calendar-events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
      calendarEvents = Array.isArray(payload.events) ? payload.events : [];
      calendarStatus = "ready";
    } catch (error) {
      calendarStatus = "error";
      calendarError = error?.message || "Unable to load calendar.";
    }
    render();
  }

  function renderToday() {
    const peopleCount = notebook.people.length;
    const reminderCount = notebook.people.reduce((count, person) => count + person.reminders.length, 0);
    return `
      <section class="qapp-grid qapp-grid--stats">
        <article class="qapp-panel">
          <span class="qapp-stat">${peopleCount}</span>
          <h3>People Tracked</h3>
          <p>Relationship notes, memory cards, and conversation history.</p>
        </article>
        <article class="qapp-panel">
          <span class="qapp-stat">${reminderCount}</span>
          <h3>Follow-Ups</h3>
          <p>Prompts for thoughtful questions and unfinished conversations.</p>
        </article>
        <article class="qapp-panel">
          <span class="qapp-stat">0</span>
          <h3>Calendar Events</h3>
          <p>Ready for Supabase-backed planning and daily review.</p>
        </article>
      </section>
      <section class="qapp-panel qapp-wide-panel">
        <div class="qapp-panel-title-row">
          <div>
            <h3>Relationship Notebook</h3>
          </div>
          ${statusPill(notebookStatus === "ready" ? "Supabase" : "Loading")}
        </div>
        <p>Start with people and conversations. Profiles, interactions, memory cards, and follow-up reminders now save to Supabase.</p>
      </section>
    `;
  }

  function renderPeople() {
    if (notebookStatus === "loading") {
      return `
        <section class="qapp-panel"><p>Loading people, conversations, memory cards, and reminders...</p></section>
      `;
    }

    if (notebookStatus === "error") {
      return `
        <section class="qapp-panel">
          <div class="qapp-panel-title-row">
            <h3>Load failed</h3>
            ${statusPill("Error")}
          </div>
          <p>${escapeHtml(notebookError)}</p>
          <button class="qapp-inline-button" data-action="reload-notebook" type="button">Try Again</button>
        </section>
      `;
    }

    const selectedPerson = selectedPersonId ? notebook.people.find((person) => person.id === selectedPersonId) : null;
    if (peopleMode === "profile" && selectedPerson) {
      return renderPersonProfile(selectedPerson);
    }

    if (peopleMode === "capture") {
      return renderPeopleCapture();
    }

    const query = peopleSearch.trim().toLowerCase();
    const filteredPeople = notebook.people.filter((person) => {
      if (!query) return true;
      const values = [
        person.name,
        person.summary,
        person.email,
        person.phone,
        person.first_met_location,
        ...(person.tags || []),
        ...(person.memoryCards || []).flatMap((card) => [card.label, card.value]),
      ];
      return values.some((value) => String(value || "").toLowerCase().includes(query));
    });

    const peopleMarkup = filteredPeople.map((person) => {
      const latestInteraction = person.interactions[0];
      const nextReminder = person.reminders[0];
      const topMemory = person.memoryCards[0];
      return `
        <button class="qapp-person-row" data-action="open-person" data-person-id="${escapeHtml(person.id)}" type="button">
          <span class="qapp-person-avatar">${escapeHtml(person.name.charAt(0) || "?")}</span>
          <span class="qapp-person-row-main">
            <strong>${escapeHtml(person.name)}</strong>
            <span>${escapeHtml(person.summary)}</span>
            <span class="qapp-person-row-meta">
              ${escapeHtml(latestInteraction ? `Last: ${latestInteraction.date}` : "No conversations yet")}
              ${topMemory ? ` | ${escapeHtml(topMemory.label)}: ${escapeHtml(topMemory.value)}` : ""}
            </span>
          </span>
          <span class="qapp-person-row-side">
            ${(person.tags || []).slice(0, 2).map(statusPill).join("")}
            ${nextReminder ? `<small>Next: ${escapeHtml(nextReminder.title)}</small>` : ""}
          </span>
        </button>
      `;
    }).join("");

    return `
      <section class="qapp-panel qapp-people-toolbar">
        <label>
          <span>Search people</span>
          <input id="qappPeopleSearch" type="search" value="${escapeHtml(peopleSearch)}" placeholder="Search name, tag, memory, email, phone">
        </label>
        <button class="qapp-inline-button" data-action="new-person-note" type="button">Add Conversation</button>
      </section>
      <section class="qapp-list qapp-people-list">
        ${peopleMarkup || `<article class="qapp-panel"><h3>No people found</h3><p>${query ? "Try a different search." : "Add a conversation to create the first relationship profile."}</p></article>`}
      </section>
    `;
  }

  function renderPersonProfile(person) {
    return `
      <section class="qapp-profile-head">
        <button class="qapp-text-button" data-action="back-to-people" type="button">Back to people</button>
        <div class="qapp-person-card qapp-person-card--profile">
        <div class="qapp-person-avatar">${escapeHtml(person.name.charAt(0) || "?")}</div>
        <div class="qapp-person-main">
          <div class="qapp-panel-title-row">
            <div>
              <h3>${escapeHtml(person.name)}</h3>
              <p>${escapeHtml(person.summary)}</p>
            </div>
            <div class="qapp-tag-row">${person.tags.map(statusPill).join("")}</div>
          </div>
          <div class="qapp-profile-meta">
            <span><strong>Email</strong>${escapeHtml(person.email || "Not saved")}</span>
            <span><strong>Phone</strong>${escapeHtml(person.phone || "Not saved")}</span>
            <span><strong>First Met</strong>${escapeHtml(person.first_met_location || person.firstMetLocation || "Not saved")}</span>
          </div>
          <div class="qapp-action-row">
            <button class="qapp-inline-button" data-action="add-note-for-person" data-person-id="${escapeHtml(person.id)}" type="button">Add Conversation</button>
            <button class="qapp-soft-button" data-action="edit-person" data-person-id="${escapeHtml(person.id)}" type="button">Edit Profile</button>
            <button class="qapp-danger-button" data-action="delete-person" data-person-id="${escapeHtml(person.id)}" type="button">Delete Profile</button>
          </div>
          <div class="qapp-subsection-title">
            <h4>Memory Cards</h4>
            <span>${person.memoryCards.length}</span>
          </div>
          <div class="qapp-memory-list">
            ${person.memoryCards.length ? person.memoryCards.map((card) => `
              <div class="qapp-memory-card">
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.value)}</strong>
                ${card.id ? `<div class="qapp-item-actions">
                  <button data-action="edit-memory" data-item-id="${escapeHtml(card.id)}" type="button">Edit</button>
                  <button data-action="delete-memory" data-item-id="${escapeHtml(card.id)}" type="button">Delete</button>
                </div>` : ""}
              </div>
            `).join("") : `<div class="qapp-memory-card"><span>Memory Cards</span><strong>No facts saved yet.</strong></div>`}
          </div>
          <div class="qapp-subsection-title">
            <h4>Conversation Log</h4>
            <span>${person.interactions.length}</span>
          </div>
          <div class="qapp-interaction-log">
            ${person.interactions.length ? person.interactions.map((interaction) => `
              <div class="qapp-log-entry">
                <span>${escapeHtml(interaction.date)} - ${escapeHtml(interaction.location)}</span>
                <p>${escapeHtml(interaction.notes)}</p>
                <div class="qapp-tag-row">${interaction.topics.map(statusPill).join("")}</div>
                ${interaction.id ? `<div class="qapp-item-actions">
                  <button data-action="edit-interaction" data-item-id="${escapeHtml(interaction.id)}" type="button">Edit</button>
                  <button data-action="delete-interaction" data-item-id="${escapeHtml(interaction.id)}" type="button">Delete</button>
                </div>` : ""}
              </div>
            `).join("") : `<div class="qapp-log-entry"><span>Conversation Log</span><p>No conversations saved yet.</p></div>`}
          </div>
          <div class="qapp-subsection-title">
            <h4>Follow-Up Reminders</h4>
            <span>${person.reminders.length}</span>
          </div>
          <div class="qapp-reminder-list">
            ${person.reminders.length ? person.reminders.map((reminder) => `
              <div class="qapp-reminder">
                <strong>${escapeHtml(reminder.title)}</strong>
                <span>${escapeHtml(reminder.due)}</span>
                ${reminder.id ? `<div class="qapp-item-actions">
                  <button data-action="edit-reminder" data-item-id="${escapeHtml(reminder.id)}" type="button">Edit</button>
                  <button data-action="delete-reminder" data-item-id="${escapeHtml(reminder.id)}" type="button">Delete</button>
                </div>` : ""}
              </div>
            `).join("") : `<div class="qapp-reminder"><strong>No follow-ups yet</strong><span>Add one from a conversation note.</span></div>`}
          </div>
        </div>
        </div>
      </section>
    `;
  }

  function confidencePercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return `${Math.round(number * 100)}%`;
  }

  function renderRelationshipDraft() {
    if (relationshipDraftStatus === "loading") {
      return `
        <section class="qapp-review-panel">
          <div class="qapp-panel-title-row">
            <h3>Reviewing note</h3>
            ${statusPill("Working")}
          </div>
          <p>Checking names, topics, memory cards, and follow-ups before anything is saved.</p>
        </section>
      `;
    }

    if (relationshipDraftStatus === "error") {
      return `
        <section class="qapp-review-panel">
          <div class="qapp-panel-title-row">
            <h3>Review failed</h3>
            ${statusPill("Error")}
          </div>
          <p>${escapeHtml(relationshipDraftError)}</p>
        </section>
      `;
    }

    if (!relationshipDraft) return "";

    const existingPeople = Array.isArray(relationshipDraft.people) ? relationshipDraft.people : [];
    const possiblePeople = Array.isArray(relationshipDraft.possiblePeople) ? relationshipDraft.possiblePeople : [];
    const interaction = relationshipDraft.interaction || {};
    const memoryCards = Array.isArray(relationshipDraft.memoryCards) ? relationshipDraft.memoryCards : [];
    const reminders = Array.isArray(relationshipDraft.reminders) ? relationshipDraft.reminders : [];
    const questions = Array.isArray(relationshipDraft.questions) ? relationshipDraft.questions : [];

    return `
      <section class="qapp-review-panel">
        <div class="qapp-panel-title-row">
          <div>
            <p class="qapp-kicker">Review Before Saving</p>
            <h3>${escapeHtml(relationshipDraft.summary || "Suggested structure")}</h3>
          </div>
          ${statusPill(relationshipDraft.source === "ai" ? "AI Reviewed" : "Script Reviewed")}
        </div>
        ${questions.length ? `<div class="qapp-review-note">${questions.map((question) => `<p>${escapeHtml(question)}</p>`).join("")}</div>` : ""}
        <div class="qapp-review-grid">
          <div class="qapp-review-card">
            <h4>Apply to existing profiles</h4>
            ${existingPeople.length ? existingPeople.map((person) => `
              <label class="qapp-check-row">
                <input name="draftPersonIds" type="checkbox" value="${escapeHtml(person.id)}" ${person.selected === false ? "" : "checked"}>
                <span>
                  <strong>${escapeHtml(person.name)}</strong>
                  <small>${escapeHtml(person.matchedAlias ? `Matched "${person.matchedAlias}"` : confidencePercent(person.confidence))}</small>
                </span>
              </label>
            `).join("") : `<p>No existing profiles were confidently matched.</p>`}
          </div>
          <div class="qapp-review-card">
            <h4>Create possible new profiles</h4>
            ${possiblePeople.length ? possiblePeople.map((person) => `
              <label class="qapp-check-row">
                <input name="draftNewPeople" type="checkbox" value="${escapeHtml(person.name)}" ${Number(person.confidence) >= 0.75 ? "checked" : ""}>
                <span>
                  <strong>${escapeHtml(person.name)}</strong>
                  <small>${escapeHtml(confidencePercent(person.confidence) || "Possible new person")}</small>
                </span>
              </label>
            `).join("") : `<p>No new people detected.</p>`}
          </div>
          <div class="qapp-review-card">
            <h4>Conversation</h4>
            <p>${escapeHtml(interaction.topics?.length ? `Topics: ${interaction.topics.join(", ")}` : "No topics detected yet.")}</p>
            ${interaction.dateHint ? `<p>${escapeHtml(`Timing mentioned: ${interaction.dateHint}`)}</p>` : ""}
          </div>
          <div class="qapp-review-card">
            <h4>Memory Cards</h4>
            ${memoryCards.length ? memoryCards.map((card, index) => `
              <label class="qapp-check-row">
                <input name="draftMemoryIndexes" type="checkbox" value="${index}" checked>
                <span>
                  <strong>${escapeHtml(card.label)}</strong>
                  <small>${escapeHtml(card.value)}</small>
                </span>
              </label>
            `).join("") : `<p>No memory cards suggested.</p>`}
          </div>
          <div class="qapp-review-card">
            <h4>Follow-Ups</h4>
            ${reminders.length ? reminders.map((reminder, index) => `
              <label class="qapp-check-row">
                <input name="draftReminderIndexes" type="checkbox" value="${index}" checked>
                <span>
                  <strong>${escapeHtml(reminder.title)}</strong>
                  <small>${escapeHtml(reminder.details || "Reminder candidate")}</small>
                </span>
              </label>
            `).join("") : `<p>No follow-ups suggested.</p>`}
          </div>
        </div>
      </section>
    `;
  }

  function renderPeopleCapture() {
    const selectedPerson = selectedPersonId ? notebook.people.find((person) => person.id === selectedPersonId) : null;
    return `
      <section class="qapp-panel">
        <button class="qapp-text-button" data-action="back-to-people" type="button">Back to people</button>
        <form id="qappQuickCapture" class="qapp-capture-form">
          <div class="qapp-form-section">
            <div class="qapp-form-section-title">
              <p class="qapp-kicker">Capture</p>
              <h3>Record the conversation or event</h3>
            </div>
            <label>
              <span>Notes</span>
              <textarea name="note" rows="6" placeholder="Example: Met with Jordan after work. He mentioned his daughter starts college next month, his roof project is still delayed, and he wants to compare bids before winter.">${escapeHtml(relationshipCaptureNote)}</textarea>
            </label>
            <button class="qapp-inline-button" data-action="review-relationship-note" type="button">Review Before Saving</button>
          </div>

          ${renderRelationshipDraft()}

          <details class="qapp-optional-details">
            <summary>Advanced details</summary>
            <div class="qapp-form-section">
              <div class="qapp-form-section-title">
                <p class="qapp-kicker">Contact Profile</p>
                <h3>Override suggested profile details when needed</h3>
              </div>
              <div class="qapp-capture-grid">
                <label class="qapp-person-picker">
                  <span>Name</span>
                  <input name="personId" type="hidden" value="${escapeHtml(selectedPerson?.id || "")}">
                  <input name="name" type="text" value="${escapeHtml(selectedPerson?.name || "")}" placeholder="Full name">
                  <div id="qappPersonSuggestions" class="qapp-suggestions" hidden></div>
                </label>
                <label>
                  <span>Tags</span>
                  <input name="tags" type="text" value="${escapeHtml((selectedPerson?.tags || []).join(", "))}" placeholder="Friend, coworker, client">
                </label>
                <label>
                  <span>Email</span>
                  <input name="email" type="email" value="${escapeHtml(selectedPerson?.email || "")}" placeholder="name@example.com">
                </label>
                <label>
                  <span>Phone</span>
                  <input name="phone" type="tel" value="${escapeHtml(selectedPerson?.phone || "")}" placeholder="(541) 555-0123">
                </label>
                <label>
                  <span>Where you met</span>
                  <input name="firstMetLocation" type="text" value="${escapeHtml(selectedPerson?.first_met_location || selectedPerson?.firstMetLocation || "")}" placeholder="Meeting, event, or location">
                </label>
                <label>
                  <span>Photo URL</span>
                  <input name="photoUrl" type="url" value="${escapeHtml(selectedPerson?.photo_url || selectedPerson?.photoUrl || "")}" placeholder="Optional">
                </label>
              </div>
              <label>
                <span>Overview</span>
                <textarea name="overview" rows="3" placeholder="Short profile summary. Leave blank to let the app generate one.">${escapeHtml(selectedPerson?.overview || "")}</textarea>
              </label>
            </div>

            <div class="qapp-form-section">
              <div class="qapp-form-section-title">
                <p class="qapp-kicker">Conversation Log</p>
                <h3>Optional metadata</h3>
              </div>
              <div class="qapp-capture-grid">
                <label>
                  <span>Location</span>
                  <input name="location" type="text" placeholder="Office, call, event, or location">
                </label>
                <label>
                  <span>Tone</span>
                  <input name="mood" type="text" placeholder="Positive, concerned, rushed">
                </label>
                <label>
                  <span>Topics</span>
                  <input name="topics" type="text" placeholder="work, family, travel">
                </label>
                <label>
                  <span>Summary override</span>
                  <input name="aiSummary" type="text" placeholder="Optional one-line summary">
                </label>
              </div>
            </div>

            <div class="qapp-form-section">
              <div class="qapp-form-section-title">
                <p class="qapp-kicker">Memory Cards</p>
                <h3>Specific facts to keep on the profile</h3>
              </div>
              <div class="qapp-memory-input-grid">
                <label>
                  <span>Fact 1 label</span>
                  <input name="memoryLabel1" type="text" placeholder="Family">
                </label>
                <label>
                  <span>Fact 1 value</span>
                  <input name="memoryValue1" type="text" placeholder="Daughter starts college next month">
                </label>
                <label>
                  <span>Fact 2 label</span>
                  <input name="memoryLabel2" type="text" placeholder="Project">
                </label>
                <label>
                  <span>Fact 2 value</span>
                  <input name="memoryValue2" type="text" placeholder="Comparing roof bids before winter">
                </label>
              </div>
            </div>

            <div class="qapp-form-section">
              <div class="qapp-form-section-title">
                <p class="qapp-kicker">Follow-Up Reminder</p>
                <h3>Optional reminder created from this interaction</h3>
              </div>
              <div class="qapp-capture-grid">
                <label>
                  <span>Reminder</span>
                  <input name="reminderTitle" type="text" placeholder="Follow up about roof bids">
                </label>
                <label>
                  <span>Reminder date</span>
                  <input name="remindAt" type="date">
                </label>
              </div>
            </div>
          </details>
          <button type="submit">Save Interaction</button>
        </form>
      </section>
    `;
  }

  function eventsForDate(dateKey) {
    return calendarEvents
      .filter((event) => toDateKey(event.starts_at) === dateKey && event.status !== "cancelled")
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }

  function renderCalendarEventForm() {
    const editingEvent = editingCalendarEventId
      ? calendarEvents.find((event) => event.id === editingCalendarEventId)
      : null;
    const selectedDate = selectedCalendarDate || toDateKey(new Date());
    const defaultStart = `${selectedDate}T09:00`;
    const defaultEnd = `${selectedDate}T10:00`;
    return `
      <section class="qapp-panel">
        <button class="qapp-text-button" data-calendar-action="back-month" type="button">Back to calendar</button>
        <form id="qappCalendarForm" class="qapp-capture-form qapp-calendar-form">
          <input name="id" type="hidden" value="${escapeHtml(editingEvent?.id || "")}">
          <div class="qapp-form-section">
            <div class="qapp-form-section-title">
              <h3>${editingEvent ? "Edit event" : "New event"}</h3>
            </div>
            <label>
              <span>Title</span>
              <input name="title" type="text" value="${escapeHtml(editingEvent?.title || "")}" placeholder="Dinner, work block, appointment" required>
            </label>
            <div class="qapp-capture-grid">
              <label>
                <span>Start</span>
                <input name="startsAt" type="datetime-local" value="${escapeHtml(editingEvent ? toDateTimeLocal(editingEvent.starts_at) : defaultStart)}" required>
              </label>
              <label>
                <span>End</span>
                <input name="endsAt" type="datetime-local" value="${escapeHtml(editingEvent ? toDateTimeLocal(editingEvent.ends_at) : defaultEnd)}">
              </label>
              <label>
                <span>Location</span>
                <input name="location" type="text" value="${escapeHtml(editingEvent?.location || "")}" placeholder="Optional">
              </label>
              <label>
                <span>Status</span>
                <select name="status">
                  ${["confirmed", "tentative", "cancelled"].map((status) => `
                    <option value="${status}" ${editingEvent?.status === status ? "selected" : ""}>${status}</option>
                  `).join("")}
                </select>
              </label>
            </div>
            <label class="qapp-check-row">
              <input name="allDay" type="checkbox" ${editingEvent?.all_day ? "checked" : ""}>
              <span><strong>All day</strong><small>Use this for full-day reminders or events without a specific time.</small></span>
            </label>
            <label>
              <span>Notes</span>
              <textarea name="description" rows="4" placeholder="Details, context, or why it matters">${escapeHtml(editingEvent?.description || "")}</textarea>
            </label>
          </div>
          <div class="qapp-action-row">
            <button type="submit">${editingEvent ? "Save Event" : "Create Event"}</button>
            ${editingEvent ? `<button class="qapp-danger-button" data-calendar-action="delete-event" data-event-id="${escapeHtml(editingEvent.id)}" type="button">Delete Event</button>` : ""}
          </div>
        </form>
      </section>
    `;
  }

  function renderCalendar() {
    if (calendarStatus === "loading") {
      return `<section class="qapp-panel"><p>Loading calendar...</p></section>`;
    }

    if (calendarStatus === "error") {
      return `
        <section class="qapp-panel">
          <div class="qapp-panel-title-row">
            <h3>Calendar load failed</h3>
            ${statusPill("Error")}
          </div>
          <p>${escapeHtml(calendarError)}</p>
          <button class="qapp-inline-button" data-calendar-action="reload" type="button">Try Again</button>
        </section>
      `;
    }

    if (calendarMode === "form") {
      return renderCalendarEventForm();
    }

    const todayKey = toDateKey(new Date());
    const firstOfMonth = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());
    const selectedEvents = eventsForDate(selectedCalendarDate);
    const upcomingEvents = calendarEvents
      .filter((event) => event.status !== "cancelled" && new Date(event.starts_at) >= new Date(new Date().setHours(0, 0, 0, 0)))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 5);
    const dayCells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = toDateKey(date);
      const dayEvents = eventsForDate(dateKey);
      const inMonth = date.getMonth() === calendarCursor.getMonth();
      return `
        <button class="qapp-calendar-day ${inMonth ? "" : "is-muted"} ${dateKey === todayKey ? "is-today" : ""} ${dateKey === selectedCalendarDate ? "is-selected" : ""}" data-calendar-action="select-day" data-date="${dateKey}" type="button">
          <span>${date.getDate()}</span>
          ${dayEvents.slice(0, 3).map((event) => `<small>${escapeHtml(event.title)}</small>`).join("")}
          ${dayEvents.length > 3 ? `<em>+${dayEvents.length - 3}</em>` : ""}
        </button>
      `;
    }).join("");

    return `
      <section class="qapp-calendar-shell">
        <div class="qapp-calendar-toolbar">
          <div>
            <h3>${escapeHtml(monthLabel(calendarCursor))}</h3>
            <p>${calendarEvents.length} event${calendarEvents.length === 1 ? "" : "s"} loaded</p>
          </div>
          <div class="qapp-action-row">
            <button class="qapp-soft-button" data-calendar-action="prev-month" type="button">Prev</button>
            <button class="qapp-soft-button" data-calendar-action="today" type="button">Today</button>
            <button class="qapp-soft-button" data-calendar-action="next-month" type="button">Next</button>
            <button class="qapp-inline-button" data-calendar-action="new-event" type="button">Add Event</button>
          </div>
        </div>
        <div class="qapp-calendar-layout">
          <section class="qapp-panel qapp-calendar-month" aria-label="Calendar month">
            <div class="qapp-calendar-weekdays">
              ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<span>${day}</span>`).join("")}
            </div>
            <div class="qapp-calendar-grid">
              ${dayCells}
            </div>
          </section>
          <aside class="qapp-panel qapp-calendar-agenda">
            <div class="qapp-panel-title-row">
              <h3>${escapeHtml(formatDateKey(selectedCalendarDate, "Selected day"))}</h3>
              ${statusPill(`${selectedEvents.length}`)}
            </div>
            <div class="qapp-calendar-event-list">
              ${selectedEvents.length ? selectedEvents.map((event) => `
                <article class="qapp-calendar-event">
                  <span>${escapeHtml(formatEventTime(event))}</span>
                  <button class="qapp-calendar-event-title" data-calendar-action="edit-event" data-event-id="${escapeHtml(event.id)}" type="button">${escapeHtml(event.title)}</button>
                  ${event.location ? `<p>${escapeHtml(event.location)}</p>` : ""}
                  ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
                  <div class="qapp-item-actions">
                    <button data-calendar-action="edit-event" data-event-id="${escapeHtml(event.id)}" type="button">Edit</button>
                    <button data-calendar-action="delete-event" data-event-id="${escapeHtml(event.id)}" type="button">Delete</button>
                  </div>
                </article>
              `).join("") : `<article class="qapp-calendar-event"><strong>No events</strong><p>Add an event or choose another day.</p></article>`}
            </div>
            <div class="qapp-subsection-title">
              <h4>Upcoming</h4>
              <span>${upcomingEvents.length}</span>
            </div>
            <div class="qapp-calendar-event-list">
              ${upcomingEvents.length ? upcomingEvents.map((event) => `
                <button class="qapp-calendar-upcoming" data-calendar-action="edit-event" data-event-id="${escapeHtml(event.id)}" type="button">
                  <strong>${escapeHtml(event.title)}</strong>
                  <span>${escapeHtml(formatDate(event.starts_at))} · ${escapeHtml(formatEventTime(event))}</span>
                </button>
              `).join("") : `<p>No upcoming events saved yet.</p>`}
            </div>
          </aside>
        </div>
      </section>
    `;
  }

  function renderPlaceholder(route, kicker, title, copy, items) {
    return `
      <section class="qapp-grid">
        ${items.map((item) => `
          <article class="qapp-panel">
            <div class="qapp-panel-title-row">
              <h3>${escapeHtml(item.title)}</h3>
              ${statusPill(item.status)}
            </div>
            <p>${escapeHtml(item.copy)}</p>
          </article>
        `).join("")}
      </section>
    `;
  }

  function renderAiAssistant() {
    return `
      <section class="qapp-ai-app-shell" aria-label="AI Assistant">
        <iframe class="qapp-ai-frame" src="/AI/?embed=app" title="Quentin Nichols AI"></iframe>
      </section>
    `;
  }

  function render() {
    view.classList.toggle("qapp-view--ai", currentRoute === "ai");
    if (currentRoute === "today") {
      view.innerHTML = renderToday();
    } else if (currentRoute === "people") {
      view.innerHTML = renderPeople();
      bindPeopleForms();
    } else if (currentRoute === "calendar") {
      view.innerHTML = renderCalendar();
      bindCalendarForms();
    } else if (currentRoute === "tasks") {
      view.innerHTML = renderPlaceholder("tasks", "Execution", "Tasks", "The tasks table is ready for priorities, due dates, statuses, and AI-created action items.", [
        { title: "Today", status: "Planned", copy: "A compact list of what actually needs attention." },
        { title: "Follow-Ups", status: "Linked", copy: "Relationship reminders can become tasks when action is needed." },
        { title: "Done Log", status: "Planned", copy: "Keep a searchable record of completed work." },
      ]);
    } else if (currentRoute === "notes") {
      view.innerHTML = renderPlaceholder("notes", "Capture", "Notes", "Notes will hold quick thoughts, planning entries, and raw material before AI organizes it.", [
        { title: "Quick Note", status: "Planned", copy: "Capture a thought without deciding where it belongs yet." },
        { title: "Daily Plan", status: "Planned", copy: "Write or generate a plan before the next day starts." },
        { title: "Archive", status: "Planned", copy: "Search old entries and promote important details into AI context." },
      ]);
    } else if (currentRoute === "ai") {
      view.innerHTML = renderAiAssistant();
    } else {
      view.innerHTML = renderPlaceholder("inquiries", "Website", "Inquiries", "Project and photography inquiries currently send email; Supabase storage is ready for later.", [
        { title: "Contact Inbox", status: "Future", copy: "Store incoming inquiries in Supabase after the email flow." },
        { title: "Source Tracking", status: "Future", copy: "Keep source page, form type, and metadata with each inquiry." },
        { title: "AI Triage", status: "Future", copy: "Summarize leads and suggest follow-up responses." },
      ]);
    }
  }

  function bindCalendarForms() {
    const calendarButtons = [...document.querySelectorAll("[data-calendar-action]")];
    const form = document.getElementById("qappCalendarForm");

    calendarButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.calendarAction || "";
        const eventId = button.dataset.eventId || "";
        if (action === "reload") {
          loadCalendarData();
          return;
        }
        if (action === "prev-month") {
          calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
          selectedCalendarDate = toDateKey(calendarCursor);
          await loadCalendarData();
          return;
        }
        if (action === "next-month") {
          calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
          selectedCalendarDate = toDateKey(calendarCursor);
          await loadCalendarData();
          return;
        }
        if (action === "today") {
          const today = new Date();
          calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);
          selectedCalendarDate = toDateKey(today);
          await loadCalendarData();
          return;
        }
        if (action === "select-day") {
          selectedCalendarDate = button.dataset.date || selectedCalendarDate;
          const selectedDate = new Date(`${selectedCalendarDate}T12:00:00`);
          if (Number.isFinite(selectedDate.getTime()) && selectedDate.getMonth() !== calendarCursor.getMonth()) {
            calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
            await loadCalendarData();
          } else {
            render();
          }
          return;
        }
        if (action === "new-event") {
          editingCalendarEventId = "";
          calendarMode = "form";
          render();
          return;
        }
        if (action === "edit-event") {
          editingCalendarEventId = eventId;
          calendarMode = "form";
          render();
          return;
        }
        if (action === "back-month") {
          editingCalendarEventId = "";
          calendarMode = "month";
          render();
          return;
        }
        if (action === "delete-event") {
          if (!eventId) return;
          if (!await qappConfirm("Delete this calendar event?", "Delete event", { confirmLabel: "Delete", danger: true })) return;
          try {
            await apiJson("/api/calendar-events", { method: "DELETE", body: { id: eventId } });
            editingCalendarEventId = "";
            calendarMode = "month";
            await loadCalendarData();
          } catch (error) {
            await qappAlert(error?.message || "Unable to delete event.", "Calendar error");
          }
        }
      });
    });

    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);
      const id = String(formData.get("id") || "").trim();
      const startsAt = fromDateTimeLocal(formData.get("startsAt"));
      const endsAt = fromDateTimeLocal(formData.get("endsAt"));
      if (!startsAt) {
        await qappAlert("A valid start date is required.", "Calendar event");
        return;
      }
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
      try {
        await apiJson("/api/calendar-events", {
          method: id ? "PATCH" : "POST",
          body: {
            id,
            title: String(formData.get("title") || "").trim(),
            description: String(formData.get("description") || "").trim(),
            location: String(formData.get("location") || "").trim(),
            startsAt,
            endsAt,
            allDay: formData.get("allDay") === "on",
            status: String(formData.get("status") || "confirmed"),
          },
        });
        selectedCalendarDate = toDateKey(startsAt) || selectedCalendarDate;
        const selectedDate = new Date(`${selectedCalendarDate}T12:00:00`);
        if (Number.isFinite(selectedDate.getTime())) {
          calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
        }
        editingCalendarEventId = "";
        calendarMode = "month";
        await loadCalendarData();
      } catch (error) {
        await qappAlert(error?.message || "Unable to save event.", "Calendar error");
        submitButton.disabled = false;
        submitButton.textContent = id ? "Save Event" : "Create Event";
      }
    });
  }

  function bindPeopleForms() {
    const form = document.getElementById("qappQuickCapture");
    const reloadButton = document.querySelector('[data-action="reload-notebook"]');
    const searchInput = document.getElementById("qappPeopleSearch");
    const backButtons = [...document.querySelectorAll('[data-action="back-to-people"]')];
    const newConversationButton = document.querySelector('[data-action="new-person-note"]');
    const addForPersonButton = document.querySelector('[data-action="add-note-for-person"]');
    const reviewButton = document.querySelector('[data-action="review-relationship-note"]');
    const personRows = [...document.querySelectorAll('[data-action="open-person"]')];
    const editPersonButton = document.querySelector('[data-action="edit-person"]');
    const deletePersonButton = document.querySelector('[data-action="delete-person"]');
    const itemActionButtons = [...document.querySelectorAll("[data-item-id]")];
    const activePerson = selectedPersonId ? notebook.people.find((person) => person.id === selectedPersonId) : null;

    if (reloadButton) {
      reloadButton.addEventListener("click", loadNotebookData);
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        const cursorPosition = searchInput.selectionStart || searchInput.value.length;
        peopleSearch = searchInput.value;
        render();
        const nextSearchInput = document.getElementById("qappPeopleSearch");
        if (nextSearchInput) {
          nextSearchInput.focus();
          nextSearchInput.setSelectionRange(cursorPosition, cursorPosition);
        }
      });
    }

    backButtons.forEach((button) => {
      button.addEventListener("click", () => {
        peopleMode = "list";
        selectedPersonId = "";
        relationshipCaptureNote = "";
        relationshipDraft = null;
        relationshipDraftStatus = "idle";
        relationshipDraftError = "";
        render();
      });
    });

    personRows.forEach((button) => {
      button.addEventListener("click", () => {
        selectedPersonId = button.dataset.personId || "";
        peopleMode = "profile";
        render();
      });
    });

    if (newConversationButton) {
      newConversationButton.addEventListener("click", () => {
        selectedPersonId = "";
        peopleMode = "capture";
        relationshipCaptureNote = "";
        relationshipDraft = null;
        relationshipDraftStatus = "idle";
        relationshipDraftError = "";
        render();
      });
    }

    if (addForPersonButton) {
      addForPersonButton.addEventListener("click", () => {
        selectedPersonId = addForPersonButton.dataset.personId || selectedPersonId;
        peopleMode = "capture";
        relationshipCaptureNote = "";
        relationshipDraft = null;
        relationshipDraftStatus = "idle";
        relationshipDraftError = "";
        render();
      });
    }

    if (editPersonButton && activePerson) {
      editPersonButton.addEventListener("click", async () => {
        const values = await qappModal({
          title: "Edit profile",
          fields: [
            { label: "Name", value: activePerson.name || "" },
            { label: "Email", value: activePerson.email || "" },
            { label: "Phone", value: activePerson.phone || "" },
            { label: "Where you met", value: activePerson.first_met_location || "" },
            { label: "Tags, comma separated", value: (activePerson.tags || []).join(", ") },
            { label: "Overview", value: activePerson.overview || activePerson.summary || "", type: "textarea", rows: 4 },
          ],
          confirmLabel: "Save Profile",
        });
        if (!values) return;
        const [name, email, phone, firstMetLocation, tagText, overview] = values;
        if (!name) return;
        const tags = String(tagText || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        try {
          await apiJson("/api/people", {
            method: "PATCH",
            body: {
              id: activePerson.id,
              name,
              email,
              phone,
              firstMetLocation,
              tags,
              overview,
              photoUrl: activePerson.photo_url || activePerson.photoUrl || "",
            },
          });
          await loadNotebookData();
          selectedPersonId = activePerson.id;
          peopleMode = "profile";
          render();
        } catch (error) {
          await qappAlert(error?.message || "Unable to update profile.", "Profile error");
        }
      });
    }

    if (deletePersonButton && activePerson) {
      deletePersonButton.addEventListener("click", async () => {
        if (!await qappConfirm(`Delete ${activePerson.name} and all notebook data attached to this profile?`, "Delete profile", { confirmLabel: "Delete Profile", danger: true })) return;
        try {
          await apiJson("/api/people", {
            method: "POST",
            body: { action: "delete", id: activePerson.id, name: activePerson.name },
          });
          selectedPersonId = "";
          peopleMode = "list";
          await loadNotebookData();
          render();
        } catch (error) {
          await qappAlert(error?.message || "Unable to delete profile.", "Profile error");
        }
      });
    }

    itemActionButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        if (!activePerson) return;
        const action = button.dataset.action || "";
        const itemId = button.dataset.itemId || "";
        const isDelete = action.startsWith("delete-");
        const type = action.replace("edit-", "").replace("delete-", "");
        const memory = activePerson.memoryCards.find((item) => item.id === itemId);
        const interaction = activePerson.interactions.find((item) => item.id === itemId);
        const reminder = activePerson.reminders.find((item) => item.id === itemId);

        try {
          if (type === "interaction") {
            if (isDelete) {
              if (!await qappConfirm("Delete this conversation entry?", "Delete conversation", { confirmLabel: "Delete", danger: true })) return;
              await apiJson("/api/person-interactions", { method: "DELETE", body: { id: itemId } });
            } else if (interaction) {
              const values = await qappModal({
                title: "Edit conversation",
                fields: [
                  { label: "Conversation notes", value: interaction.notes || "", type: "textarea", rows: 5 },
                  { label: "Location", value: interaction.location || "" },
                  { label: "Topics, comma separated", value: (interaction.topics || []).join(", ") },
                ],
                confirmLabel: "Save Conversation",
              });
              if (!values) return;
              const [notes, location, topicText] = values;
              if (!notes) return;
              const topics = String(topicText || "")
                .split(",")
                .map((topic) => topic.trim())
                .filter(Boolean);
              await apiJson("/api/person-interactions", {
                method: "PATCH",
                body: { id: itemId, notes, location, topics, mood: interaction.mood || "" },
              });
            }
          } else if (type === "memory") {
            if (isDelete) {
              if (!await qappConfirm("Delete this memory card?", "Delete memory", { confirmLabel: "Delete", danger: true })) return;
              await apiJson("/api/relationship-items", { method: "DELETE", body: { type: "memory", id: itemId } });
            } else if (memory) {
              const values = await qappModal({
                title: "Edit memory",
                fields: [
                  { label: "Memory label", value: memory.label || "" },
                  { label: "Memory value", value: memory.value || "", type: "textarea", rows: 3 },
                ],
                confirmLabel: "Save Memory",
              });
              if (!values) return;
              const [label, value] = values;
              if (!label || !value) return;
              await apiJson("/api/relationship-items", {
                method: "PATCH",
                body: { type: "memory", id: itemId, label, value, category: memory.category || "general" },
              });
            }
          } else if (type === "reminder") {
            if (isDelete) {
              if (!await qappConfirm("Delete this follow-up reminder?", "Delete follow-up", { confirmLabel: "Delete", danger: true })) return;
              await apiJson("/api/relationship-items", { method: "DELETE", body: { type: "reminder", id: itemId } });
            } else if (reminder) {
              const values = await qappModal({
                title: "Edit follow-up",
                fields: [
                  { label: "Reminder", value: reminder.title || "" },
                  { label: "Details", value: reminder.details || "", type: "textarea", rows: 3 },
                  { label: "Remind date/time", value: reminder.remind_at || "" },
                ],
                confirmLabel: "Save Follow-Up",
              });
              if (!values) return;
              const [title, details, remindAt] = values;
              if (!title) return;
              await apiJson("/api/relationship-items", {
                method: "PATCH",
                body: { type: "reminder", id: itemId, title, details, remindAt, status: reminder.status || "open", priority: reminder.priority || "normal" },
              });
            }
          }

          await loadNotebookData();
          selectedPersonId = activePerson.id;
          peopleMode = "profile";
          render();
        } catch (error) {
          await qappAlert(error?.message || "Unable to update item.", "Notebook error");
        }
      });
    });

    if (!form) return;

    if (reviewButton) {
      reviewButton.addEventListener("click", async () => {
        const note = String(new FormData(form).get("note") || "").trim();
        if (!note) return;
        relationshipCaptureNote = note;
        relationshipDraftStatus = "loading";
        relationshipDraftError = "";
        relationshipDraft = null;
        render();
        try {
          const payload = await apiJson("/api/relationship-note-draft", {
            method: "POST",
            body: { note },
          });
          relationshipDraft = payload.draft || null;
          relationshipDraftStatus = "ready";
          render();
        } catch (error) {
          relationshipDraftStatus = "error";
          relationshipDraftError = error?.message || "Unable to review note.";
          render();
        }
      });
    }

    const nameInput = form.elements.name;
    const noteInput = form.elements.note;
    const personIdInput = form.elements.personId;
    const suggestions = document.getElementById("qappPersonSuggestions");

    function renderSuggestions() {
      if (!nameInput || !personIdInput || !suggestions) return;
      const query = String(nameInput.value || "").trim().toLowerCase();
      personIdInput.value = "";
      if (!query) {
        suggestions.hidden = true;
        suggestions.innerHTML = "";
        return;
      }

      const matches = notebook.people
        .filter((person) => {
          const name = String(person.name || "").toLowerCase();
          const preferredName = String(person.preferred_name || person.preferredName || "").toLowerCase();
          return name.includes(query) || preferredName.includes(query);
        })
        .slice(0, 6);

      if (!matches.length) {
        suggestions.hidden = true;
        suggestions.innerHTML = "";
        return;
      }

      suggestions.innerHTML = matches.map((person) => `
        <button class="qapp-suggestion" data-person-id="${escapeHtml(person.id)}" data-person-name="${escapeHtml(person.name)}" type="button">
          <strong>${escapeHtml(person.name)}</strong>
          <span>${escapeHtml(person.tags?.[0] || "Notebook profile")}</span>
        </button>
      `).join("");
      suggestions.hidden = false;
    }

    nameInput?.addEventListener("input", renderSuggestions);
    noteInput?.addEventListener("input", () => {
      relationshipCaptureNote = noteInput.value;
      relationshipDraft = null;
      relationshipDraftStatus = "idle";
      relationshipDraftError = "";
    });
    suggestions?.addEventListener("click", (event) => {
      const button = event.target.closest(".qapp-suggestion");
      if (!button) return;
      personIdInput.value = button.dataset.personId || "";
      nameInput.value = button.dataset.personName || "";
      suggestions.hidden = true;
      suggestions.innerHTML = "";
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const formData = new FormData(form);
      const note = String(formData.get("note") || "").trim();
      if (!note) return;
      const chosenPersonId = String(formData.get("personId") || "").trim();
      const typedName = String(formData.get("name") || "").trim();
      const firstNameMatch = note.match(/\b(?:met|talked to|saw)\s+([A-Z][a-z]+)/);
      const name = typedName || firstNameMatch?.[1] || "New Person";
      const location = String(formData.get("location") || "").trim() || "Not specified";
      const firstMetLocation = String(formData.get("firstMetLocation") || "").trim() || location;
      const tags = String(formData.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 12);
      const topics = String(formData.get("topics") || "")
        .split(",")
        .map((topic) => topic.trim())
        .filter(Boolean)
        .slice(0, 12);
      const memoryCards = [1, 2]
        .map((index) => ({
          label: String(formData.get(`memoryLabel${index}`) || "").trim(),
          value: String(formData.get(`memoryValue${index}`) || "").trim(),
        }))
        .filter((card) => card.label && card.value);
      const reminderTitle = String(formData.get("reminderTitle") || "").trim();
      const remindAt = String(formData.get("remindAt") || "").trim();
      const draftPersonIds = formData.getAll("draftPersonIds").map((value) => String(value || "").trim()).filter(Boolean);
      const draftNewPeople = formData.getAll("draftNewPeople").map((value) => String(value || "").trim()).filter(Boolean);
      const draftMemoryIndexes = new Set(formData.getAll("draftMemoryIndexes").map((value) => Number(value)));
      const draftReminderIndexes = new Set(formData.getAll("draftReminderIndexes").map((value) => Number(value)));
      const draftInteraction = relationshipDraft?.interaction || {};
      const draftMemoryCards = Array.isArray(relationshipDraft?.memoryCards)
        ? relationshipDraft.memoryCards
            .filter((_, index) => draftMemoryIndexes.has(index))
            .map((card) => ({
              label: String(card.label || "").trim(),
              value: String(card.value || "").trim(),
              confidence: Number.isFinite(Number(card.confidence)) ? Number(card.confidence) : 0.7,
            }))
            .filter((card) => card.label && card.value)
        : [];
      const draftReminders = Array.isArray(relationshipDraft?.reminders)
        ? relationshipDraft.reminders
            .filter((_, index) => draftReminderIndexes.has(index))
            .map((reminder) => ({
              title: String(reminder.title || "").trim(),
              details: String(reminder.details || "").trim(),
              priority: "normal",
            }))
            .filter((reminder) => reminder.title)
        : [];

      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
      try {
        const createPerson = async (personName) => {
          const overview = buildProfileOverview({
            manualOverview: formData.get("overview"),
            note,
            draftSummary: relationshipDraft?.summary,
            forceUpdate: true,
          });
          const created = await apiJson("/api/people", {
            method: "POST",
            body: {
              name: personName,
              tags: tags.length ? tags : ["Captured"],
              email: String(formData.get("email") || "").trim(),
              phone: String(formData.get("phone") || "").trim(),
              photoUrl: String(formData.get("photoUrl") || "").trim(),
              overview,
              firstMetLocation,
            },
          });
          return normalizePerson({ ...created.person, interactions: [], memoryCards: [], reminders: [] });
        };

        const updatePersonOverview = async (person) => {
          const overview = buildProfileOverview({
            manualOverview: formData.get("overview"),
            existingOverview: person.overview || person.summary,
            note,
            draftSummary: relationshipDraft?.summary,
          });
          if (!overview || overview === (person.overview || "")) return;
          await apiJson("/api/people", {
            method: "PATCH",
            body: {
              id: person.id,
              name: person.name,
              email: person.email || "",
              phone: person.phone || "",
              photoUrl: person.photo_url || person.photoUrl || "",
              firstMetLocation: person.first_met_location || person.firstMetLocation || "",
              tags: person.tags || [],
              overview,
            },
          });
        };

        const peopleToSave = draftPersonIds
          .map((id) => notebook.people.find((item) => item.id === id))
          .filter(Boolean);

        if (!peopleToSave.length && chosenPersonId) {
          const chosenPerson = notebook.people.find((item) => item.id === chosenPersonId);
          if (chosenPerson) peopleToSave.push(chosenPerson);
        }

        if (!peopleToSave.length && !draftNewPeople.length) {
          const existingPerson = notebook.people.find((item) => item.name.toLowerCase() === name.toLowerCase());
          peopleToSave.push(existingPerson || await createPerson(name));
        }

        for (const newPersonName of draftNewPeople) {
          peopleToSave.push(await createPerson(newPersonName));
        }

        const selectedMemoryCards = draftMemoryCards.length ? draftMemoryCards : memoryCards;
        const selectedReminders = draftReminders.length
          ? draftReminders
          : reminderTitle ? [{ title: reminderTitle, remindAt, priority: "normal" }] : [];
        const selectedTopics = topics.length
          ? topics
          : Array.isArray(draftInteraction.topics) && draftInteraction.topics.length ? draftInteraction.topics : ["captured"];

        await Promise.all(peopleToSave.map((person) => apiJson("/api/person-interactions", {
          method: "POST",
          body: {
            personId: person.id,
            location,
            notes: note,
            mood: String(formData.get("mood") || "").trim() || draftInteraction.mood || "",
            topics: selectedTopics,
            aiSummary: String(formData.get("aiSummary") || "").trim() || relationshipDraft?.summary || "",
            memoryCards: selectedMemoryCards,
            reminders: selectedReminders,
          },
        })));

        await Promise.all(peopleToSave.map(updatePersonOverview));

        form.reset();
        relationshipCaptureNote = "";
        relationshipDraft = null;
        relationshipDraftStatus = "idle";
        relationshipDraftError = "";
        await loadNotebookData();
        selectedPersonId = peopleToSave[0]?.id || "";
        peopleMode = "profile";
        render();
      } catch (error) {
        notebookStatus = "error";
        notebookError = error?.message || "Unable to save conversation.";
        render();
      }
    });
  }

  async function checkAuth() {
    try {
      const session = await window.siteAuth.getSession();
      if (!session) {
        window.location.href = "/login/?next=/app/";
        return;
      }
      drawerEmail.textContent = session.user?.email || "Signed in";
      authGate.hidden = true;
      shell.hidden = false;
      await loadNotebookData();
    } catch (error) {
      authMessage.textContent = error?.message || "Unable to check session.";
      authMessage.classList.add("is-error");
    }
  }

  routeButtons.forEach((button) => {
    button.addEventListener("click", () => setRoute(button.dataset.route));
  });

  menuButton.addEventListener("click", () => {
    if (drawer.classList.contains("is-open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  drawerOverlay.addEventListener("click", closeDrawer);

  window.addEventListener("message", async (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data || {};
    if (data.type !== "qapp:view-calendar-event") return;
    const dateKey = toDateKey(data.startsAt) || selectedCalendarDate || toDateKey(new Date());
    selectedCalendarDate = dateKey;
    const selectedDate = dateFromKey(dateKey);
    if (selectedDate) {
      calendarCursor = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    }
    calendarMode = "month";
    editingCalendarEventId = "";
    setRoute("calendar");
    if (calendarStatus !== "loading") {
      await loadCalendarData();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "Signing Out...";
    await window.siteAuth.logout();
    window.location.href = "/";
  });

  checkAuth();
})();
