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
  }

  function sectionHeader(kicker, title, copy) {
    return `
      <section class="qapp-section-head">
        <p class="qapp-kicker">${escapeHtml(kicker)}</p>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(copy)}</p>
      </section>
    `;
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
        date: formatDate(interaction.occurred_at),
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

  function renderToday() {
    const peopleCount = notebook.people.length;
    const reminderCount = notebook.people.reduce((count, person) => count + person.reminders.length, 0);
    return `
      ${sectionHeader("Command Center", "Plan the day before it runs you", "Calendar, tasks, relationship memory, and AI context will live here together.")}
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
            <p class="qapp-kicker">Next Build</p>
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
        ${sectionHeader("Relationship Memory", "People Notebook", "Loading your private notebook from Supabase.")}
        <section class="qapp-panel"><p>Loading people, conversations, memory cards, and reminders...</p></section>
      `;
    }

    if (notebookStatus === "error") {
      return `
        ${sectionHeader("Relationship Memory", "People Notebook", "The notebook API could not load.")}
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
      ${sectionHeader("Relationship Memory", "People Notebook", "Search your private relationship notebook, then open a person for the full profile.")}
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
                <input name="draftNewPeople" type="checkbox" value="${escapeHtml(person.name)}">
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
      ${sectionHeader("Relationship Memory", "Add Conversation", "Write it naturally first. The app will suggest who it belongs to, what to remember, and what to follow up on.")}
      <section class="qapp-panel">
        <button class="qapp-text-button" data-action="back-to-people" type="button">Back to people</button>
        <form id="qappQuickCapture" class="qapp-capture-form">
          <div class="qapp-form-section">
            <div class="qapp-form-section-title">
              <p class="qapp-kicker">Smart Capture</p>
              <h3>Type or dictate the whole interaction</h3>
            </div>
            <label>
              <span>Conversation note</span>
              <textarea name="note" rows="6" placeholder="Visited with Marla and Bruce. Marla said Wyatt's graduation dinner is Friday. Bruce mentioned the roof project is still delayed.">${escapeHtml(relationshipCaptureNote)}</textarea>
            </label>
            <button class="qapp-inline-button" data-action="review-relationship-note" type="button">Review Note</button>
          </div>

          ${renderRelationshipDraft()}

          <details class="qapp-optional-details">
            <summary>Optional manual details</summary>
            <div class="qapp-form-section">
              <div class="qapp-form-section-title">
                <p class="qapp-kicker">Contact Profile</p>
                <h3>Only fill this if the note needs help</h3>
              </div>
              <div class="qapp-capture-grid">
                <label class="qapp-person-picker">
                  <span>Name</span>
                  <input name="personId" type="hidden" value="${escapeHtml(selectedPerson?.id || "")}">
                  <input name="name" type="text" value="${escapeHtml(selectedPerson?.name || "")}" placeholder="John">
                  <div id="qappPersonSuggestions" class="qapp-suggestions" hidden></div>
                </label>
                <label>
                  <span>Tags</span>
                  <input name="tags" type="text" value="${escapeHtml((selectedPerson?.tags || []).join(", "))}" placeholder="Friend, Fire Department, Customer">
                </label>
                <label>
                  <span>Email</span>
                  <input name="email" type="email" value="${escapeHtml(selectedPerson?.email || "")}" placeholder="john@example.com">
                </label>
                <label>
                  <span>Phone</span>
                  <input name="phone" type="tel" value="${escapeHtml(selectedPerson?.phone || "")}" placeholder="(541) 555-0123">
                </label>
                <label>
                  <span>Where you met</span>
                  <input name="firstMetLocation" type="text" value="${escapeHtml(selectedPerson?.first_met_location || selectedPerson?.firstMetLocation || "")}" placeholder="Fire hall">
                </label>
                <label>
                  <span>Photo URL</span>
                  <input name="photoUrl" type="url" value="${escapeHtml(selectedPerson?.photo_url || selectedPerson?.photoUrl || "")}" placeholder="Optional">
                </label>
              </div>
              <label>
                <span>Overview</span>
                <textarea name="overview" rows="3" placeholder="A few words about who they are and what stands out.">${escapeHtml(selectedPerson?.overview || "")}</textarea>
              </label>
            </div>

          <div class="qapp-form-section">
            <div class="qapp-form-section-title">
              <p class="qapp-kicker">Conversation Log</p>
              <h3>Optional overrides</h3>
            </div>
            <div class="qapp-capture-grid">
              <label>
                <span>Conversation location</span>
                <input name="location" type="text" placeholder="Fire hall">
              </label>
              <label>
                <span>Mood</span>
                <input name="mood" type="text" placeholder="Excited, tired, worried">
              </label>
              <label>
                <span>Topics</span>
                <input name="topics" type="text" placeholder="family, work, graduation">
              </label>
              <label>
                <span>AI summary</span>
                <input name="aiSummary" type="text" placeholder="Optional short summary">
              </label>
          </div>
          </div>

          <div class="qapp-form-section">
            <div class="qapp-form-section-title">
              <p class="qapp-kicker">Memory Cards</p>
              <h3>Quick facts to remember next time</h3>
            </div>
            <div class="qapp-memory-input-grid">
              <label>
                <span>Fact 1 label</span>
                <input name="memoryLabel1" type="text" placeholder="Daughter">
              </label>
              <label>
                <span>Fact 1 value</span>
                <input name="memoryValue1" type="text" placeholder="Emily">
              </label>
              <label>
                <span>Fact 2 label</span>
                <input name="memoryLabel2" type="text" placeholder="Goal">
              </label>
              <label>
                <span>Fact 2 value</span>
                <input name="memoryValue2" type="text" placeholder="Becoming a paramedic">
              </label>
            </div>
          </div>

          <div class="qapp-form-section">
            <div class="qapp-form-section-title">
              <p class="qapp-kicker">Follow-Up Reminder</p>
              <h3>One thing worth asking about later</h3>
            </div>
            <div class="qapp-capture-grid">
              <label>
                <span>Reminder</span>
                <input name="reminderTitle" type="text" placeholder="Ask about EMT exam">
              </label>
              <label>
                <span>Remind date</span>
                <input name="remindAt" type="date">
              </label>
            </div>
          </div>
          </details>
          <button type="submit">Save Conversation</button>
        </form>
      </section>
    `;
  }

  function renderPlaceholder(route, kicker, title, copy, items) {
    return `
      ${sectionHeader(kicker, title, copy)}
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
        <iframe class="qapp-ai-frame" src="/AI/" title="Quentin Nichols AI"></iframe>
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
      view.innerHTML = renderPlaceholder("calendar", "Planning", "Calendar", "The Supabase schema has calendar_events ready for the private dashboard calendar.", [
        { title: "Month View", status: "Planned", copy: "Browse commitments and schedule blocks from the dashboard." },
        { title: "Daily Brief", status: "Planned", copy: "Summarize today, tomorrow, and upcoming commitments before the day starts." },
        { title: "AI Suggestions", status: "Planned", copy: "Suggest whether to accept, decline, or reshape plans based on preferences." },
      ]);
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
        const name = window.prompt("Name", activePerson.name || "");
        if (!name) return;
        const email = (window.prompt("Email", activePerson.email || "") ?? activePerson.email) || "";
        const phone = (window.prompt("Phone", activePerson.phone || "") ?? activePerson.phone) || "";
        const firstMetLocation = (window.prompt("Where you met", activePerson.first_met_location || "") ?? activePerson.first_met_location) || "";
        const tags = (window.prompt("Tags, comma separated", (activePerson.tags || []).join(", ")) || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        const overview = (window.prompt("Overview", activePerson.overview || activePerson.summary || "") ?? activePerson.overview) || "";
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
          window.alert(error?.message || "Unable to update profile.");
        }
      });
    }

    if (deletePersonButton && activePerson) {
      deletePersonButton.addEventListener("click", async () => {
        if (!window.confirm(`Delete ${activePerson.name} and all notebook data attached to this profile?`)) return;
        try {
          await apiJson("/api/people", {
            method: "DELETE",
            body: { id: activePerson.id },
          });
          selectedPersonId = "";
          peopleMode = "list";
          await loadNotebookData();
          render();
        } catch (error) {
          window.alert(error?.message || "Unable to delete profile.");
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
              if (!window.confirm("Delete this conversation entry?")) return;
              await apiJson("/api/person-interactions", { method: "DELETE", body: { id: itemId } });
            } else if (interaction) {
              const notes = window.prompt("Conversation notes", interaction.notes || "");
              if (!notes) return;
              const location = (window.prompt("Location", interaction.location || "") ?? interaction.location) || "";
              const topics = (window.prompt("Topics, comma separated", (interaction.topics || []).join(", ")) || "")
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
              if (!window.confirm("Delete this memory card?")) return;
              await apiJson("/api/relationship-items", { method: "DELETE", body: { type: "memory", id: itemId } });
            } else if (memory) {
              const label = window.prompt("Memory label", memory.label || "");
              if (!label) return;
              const value = window.prompt("Memory value", memory.value || "");
              if (!value) return;
              await apiJson("/api/relationship-items", {
                method: "PATCH",
                body: { type: "memory", id: itemId, label, value, category: memory.category || "general" },
              });
            }
          } else if (type === "reminder") {
            if (isDelete) {
              if (!window.confirm("Delete this follow-up reminder?")) return;
              await apiJson("/api/relationship-items", { method: "DELETE", body: { type: "reminder", id: itemId } });
            } else if (reminder) {
              const title = window.prompt("Reminder", reminder.title || "");
              if (!title) return;
              const details = (window.prompt("Details", reminder.details || "") ?? reminder.details) || "";
              const remindAt = (window.prompt("Remind date/time", reminder.remind_at || "") ?? reminder.remind_at) || "";
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
          window.alert(error?.message || "Unable to update item.");
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
