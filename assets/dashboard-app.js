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

  const storageKey = "qapp_relationship_notebook_v1";
  const routeTitles = {
    today: "Today",
    people: "People Notebook",
    calendar: "Calendar",
    tasks: "Tasks",
    notes: "Notes",
    ai: "AI Context",
    inquiries: "Inquiries",
  };

  const defaultNotebook = {
    people: [
      {
        id: "sample-john",
        name: "John",
        tags: ["Fire Department"],
        summary: "Met at the fire hall. Daughter Emily is graduating soon.",
        memoryCards: [
          { label: "Daughter", value: "Emily" },
          { label: "Current Concern", value: "Roof replacement before winter" },
        ],
        reminders: [
          { title: "Ask how Emily's graduation went", due: "This month" },
        ],
        interactions: [
          {
            date: "Recent",
            location: "Fire hall",
            mood: "Concerned but proud",
            notes: "Talked about Emily graduating and the roof project.",
            topics: ["family", "home", "graduation"],
          },
        ],
      },
    ],
  };

  let currentRoute = "today";
  let notebook = loadNotebook();

  function loadNotebook() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved && Array.isArray(saved.people)) return saved;
    } catch (_error) {}
    return defaultNotebook;
  }

  function saveNotebook() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notebook));
    } catch (_error) {}
  }

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
          ${statusPill("Local preview")}
        </div>
        <p>Start with people and conversations. Supabase tables are already shaped for profiles, interactions, memory cards, and follow-up reminders.</p>
      </section>
    `;
  }

  function renderPeople() {
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
            ${person.memoryCards.map((card) => `
              <div class="qapp-memory-card">
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.value)}</strong>
              </div>
            `).join("")}
          </div>
          <div class="qapp-interaction-log">
            ${person.interactions.map((interaction) => `
              <div class="qapp-log-entry">
                <span>${escapeHtml(interaction.date)} - ${escapeHtml(interaction.location)}</span>
                <p>${escapeHtml(interaction.notes)}</p>
                <div class="qapp-tag-row">${interaction.topics.map(statusPill).join("")}</div>
              </div>
            `).join("")}
          </div>
          <div class="qapp-reminder-list">
            ${person.reminders.map((reminder) => `
              <div class="qapp-reminder">
                <strong>${escapeHtml(reminder.title)}</strong>
                <span>${escapeHtml(reminder.due)}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </article>
    `).join("");

    return `
      ${sectionHeader("Relationship Memory", "People Notebook", "A private Oz Pearlman-style notebook for names, conversations, memory cards, and follow-ups.")}
      <section class="qapp-panel">
        <form id="qappQuickCapture" class="qapp-capture-form">
          <label>
            <span>Dictated conversation note</span>
            <textarea name="note" rows="4" placeholder="Met John at the fire hall. His daughter Emily is graduating. He is worried about replacing the roof before winter."></textarea>
          </label>
          <button type="submit">Capture Preview</button>
        </form>
      </section>
      <section class="qapp-list">${peopleMarkup}</section>
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
      view.innerHTML = renderPlaceholder("ai", "Memory Layer", "AI Context", "AI context items are the bridge between raw app data and useful assistant reasoning.", [
        { title: "Context Items", status: "Schema Ready", copy: "Store facts the AI should remember across calendar, tasks, notes, and people." },
        { title: "Conversations", status: "Schema Ready", copy: "Persist important AI chats without mixing them into random browser storage." },
        { title: "Decision Log", status: "Planned", copy: "Track why the AI suggested or arranged something." },
      ]);
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
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const note = String(new FormData(form).get("note") || "").trim();
      if (!note) return;
      const firstNameMatch = note.match(/\b(?:met|talked to|saw)\s+([A-Z][a-z]+)/i);
      const name = firstNameMatch?.[1] || "New Person";
      const id = `person-${Date.now()}`;
      notebook.people.unshift({
        id,
        name,
        tags: ["Captured"],
        summary: note,
        memoryCards: [
          { label: "Raw Note", value: note.length > 90 ? `${note.slice(0, 90)}...` : note },
        ],
        reminders: [
          { title: "Review and extract follow-ups", due: "Soon" },
        ],
        interactions: [
          {
            date: "Today",
            location: "Not specified",
            mood: "Unsorted",
            notes: note,
            topics: ["captured"],
          },
        ],
      });
      saveNotebook();
      render();
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
      render();
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
