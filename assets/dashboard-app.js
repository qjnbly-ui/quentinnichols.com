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
      memoryCards: memoryCards.map((card) => ({
        label: card.label || card.category || "Memory",
        value: card.value || "",
      })),
      reminders: reminders.map((reminder) => ({
        title: reminder.title || "Follow up",
        due: reminder.remind_at ? formatDate(reminder.remind_at, "Scheduled") : "Soon",
      })),
      interactions: interactions.map((interaction) => ({
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

    const peopleMarkup = notebook.people.map((person) => `
      <article class="qapp-person-card" data-person-id="${escapeHtml(person.id)}">
        <div class="qapp-person-avatar">${escapeHtml(person.name.charAt(0) || "?")}</div>
        <div class="qapp-person-main">
          <div class="qapp-panel-title-row">
            <div>
              <h3>${escapeHtml(person.name)}</h3>
              <p>${escapeHtml(person.summary)}</p>
            </div>
            <div class="qapp-tag-row">${person.tags.map(statusPill).join("")}</div>
          </div>
          <div class="qapp-memory-list">
            ${person.memoryCards.length ? person.memoryCards.map((card) => `
              <div class="qapp-memory-card">
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.value)}</strong>
              </div>
            `).join("") : `<div class="qapp-memory-card"><span>Memory Cards</span><strong>No facts saved yet.</strong></div>`}
          </div>
          <div class="qapp-interaction-log">
            ${person.interactions.length ? person.interactions.map((interaction) => `
              <div class="qapp-log-entry">
                <span>${escapeHtml(interaction.date)} - ${escapeHtml(interaction.location)}</span>
                <p>${escapeHtml(interaction.notes)}</p>
                <div class="qapp-tag-row">${interaction.topics.map(statusPill).join("")}</div>
              </div>
            `).join("") : `<div class="qapp-log-entry"><span>Conversation Log</span><p>No conversations saved yet.</p></div>`}
          </div>
          <div class="qapp-reminder-list">
            ${person.reminders.length ? person.reminders.map((reminder) => `
              <div class="qapp-reminder">
                <strong>${escapeHtml(reminder.title)}</strong>
                <span>${escapeHtml(reminder.due)}</span>
              </div>
            `).join("") : `<div class="qapp-reminder"><strong>No follow-ups yet</strong><span>Add one from a conversation note.</span></div>`}
          </div>
        </div>
      </article>
    `).join("");

    return `
      ${sectionHeader("Relationship Memory", "People Notebook", "A private Oz Pearlman-style notebook for names, conversations, memory cards, and follow-ups.")}
      <section class="qapp-panel">
        <form id="qappQuickCapture" class="qapp-capture-form">
          <div class="qapp-capture-grid">
            <label class="qapp-person-picker">
              <span>Name</span>
              <input name="personId" type="hidden">
              <input name="name" type="text" placeholder="John">
              <div id="qappPersonSuggestions" class="qapp-suggestions" hidden></div>
            </label>
            <label>
              <span>Location</span>
              <input name="location" type="text" placeholder="Fire hall">
            </label>
          </div>
          <label>
            <span>Dictated conversation note</span>
            <textarea name="note" rows="4" placeholder="Met John at the fire hall. His daughter Emily is graduating. He is worried about replacing the roof before winter."></textarea>
          </label>
          <button type="submit">Save Conversation</button>
        </form>
      </section>
      <section class="qapp-list">${peopleMarkup || `<article class="qapp-panel"><h3>No people yet</h3><p>Save a conversation note to create the first relationship profile.</p></article>`}</section>
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
      ${sectionHeader("Assistant", "AI inside the app", "Use the site-grounded assistant without leaving the private application.")}
      <section class="qapp-panel qapp-ai-frame-panel">
        <div class="qapp-panel-title-row">
          <div>
            <p class="qapp-kicker">Private Tool</p>
            <h3>Quentin Nichols AI</h3>
          </div>
          ${statusPill("Protected")}
        </div>
        <iframe class="qapp-ai-frame" src="/AI/" title="Quentin Nichols AI"></iframe>
      </section>
      <section class="qapp-grid">
        <article class="qapp-panel">
          <div class="qapp-panel-title-row">
            <h3>Context Items</h3>
            ${statusPill("Schema Ready")}
          </div>
          <p>Store facts the AI should remember across calendar, tasks, notes, and people.</p>
        </article>
        <article class="qapp-panel">
          <div class="qapp-panel-title-row">
            <h3>Conversations</h3>
            ${statusPill("Schema Ready")}
          </div>
          <p>Persist important AI chats without mixing them into random browser storage.</p>
        </article>
        <article class="qapp-panel">
          <div class="qapp-panel-title-row">
            <h3>Decision Log</h3>
            ${statusPill("Planned")}
          </div>
          <p>Track why the AI suggested or arranged something.</p>
        </article>
      </section>
    `;
  }

  function render() {
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
    if (reloadButton) {
      reloadButton.addEventListener("click", loadNotebookData);
    }
    if (!form) return;

    const nameInput = form.elements.name;
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
      const selectedPersonId = String(formData.get("personId") || "").trim();
      const typedName = String(formData.get("name") || "").trim();
      const firstNameMatch = note.match(/\b(?:met|talked to|saw)\s+([A-Z][a-z]+)/);
      const name = typedName || firstNameMatch?.[1] || "New Person";
      const location = String(formData.get("location") || "").trim() || "Not specified";

      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
      try {
        let person = selectedPersonId
          ? notebook.people.find((item) => item.id === selectedPersonId)
          : notebook.people.find((item) => item.name.toLowerCase() === name.toLowerCase());

        if (!person) {
          const created = await apiJson("/api/people", {
            method: "POST",
            body: {
              name,
              tags: ["Captured"],
              overview: note,
              firstMetLocation: location,
            },
          });
          person = normalizePerson({ ...created.person, interactions: [], memoryCards: [], reminders: [] });
        }

        await apiJson("/api/person-interactions", {
          method: "POST",
          body: {
            personId: person.id,
            location,
            notes: note,
            topics: ["captured"],
            memoryCards: [
              {
                label: "Raw Note",
                value: note.length > 180 ? `${note.slice(0, 180)}...` : note,
              },
            ],
            reminders: [
              {
                title: "Review and extract follow-ups",
                priority: "normal",
              },
            ],
          },
        });

        form.reset();
        await loadNotebookData();
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
