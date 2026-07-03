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
    fitness: "Fitness",
    notes: "Notes",
    ai: "AI Assistant",
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
  let tasks = [];
  let tasksStatus = "idle";
  let tasksError = "";
  let tasksMode = "list";
  let editingTaskId = "";
  const fitnessStorageKey = "qappFitnessOptionsState";
  let fitnessMode = "home";
  let fitnessStatus = "idle";
  let fitnessError = "";
  let fitnessState = loadFitnessState();
  let fitnessTimerId = 0;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanStructuredNoteText(value) {
    const original = String(value || "").replace(/\r\n?/g, "\n").trim();
    if (!original) return "";

    const bulletMatches = original.match(/(?:^|\s)[*•]\s+/g) || [];
    if (bulletMatches.length < 3) {
      return original
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    }

    const compact = original
      .replace(/[•]/g, "*")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, " ")
      .trim();
    const parts = compact.split(/\s+\*\s+/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 3) return original;

    const lines = [];
    let heading = parts.shift().replace(/[:.]+$/, "").trim();

    function pushHeading(text) {
      const clean = String(text || "").replace(/[:.]+$/, "").trim();
      if (!clean) return;
      if (lines.length) lines.push("");
      lines.push(clean);
    }

    function splitTrailingHeading(text) {
      const clean = String(text || "").trim();
      const match = clean.match(/^(.*?[.!?])\s+([A-Z][A-Za-z0-9/&' -]{2,42})$/);
      if (!match) return { note: clean, nextHeading: "" };
      const nextHeading = match[2].trim();
      const words = nextHeading.split(/\s+/);
      if (words.length > 6 || /^(I|You|She|He|They|This|That|Things|Wants|Likes|Loves|Reads|Works|Has|Is|Being)\b/.test(nextHeading)) {
        return { note: clean, nextHeading: "" };
      }
      return { note: match[1].trim(), nextHeading };
    }

    pushHeading(heading || "Notes");
    parts.forEach((part) => {
      const { note, nextHeading } = splitTrailingHeading(part);
      if (note) lines.push(`- ${note.replace(/\s+/g, " ")}`);
      if (nextHeading) pushHeading(nextHeading);
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
    if (currentRoute === "fitness") {
      fitnessMode = "home";
    }
    if (window.location.hash !== `#${currentRoute}`) {
      history.replaceState(null, "", `#${currentRoute}`);
    }
    if (currentRoute !== "people") {
      peopleMode = "list";
      selectedPersonId = "";
      relationshipCaptureNote = "";
      relationshipDraft = null;
      relationshipDraftStatus = "idle";
      relationshipDraftError = "";
    }
    if (currentRoute !== "fitness") {
      fitnessMode = "home";
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
    if (currentRoute === "calendar" && tasksStatus === "idle") {
      loadTasksData();
    }
    if (currentRoute === "tasks" && tasksStatus === "idle") {
      loadTasksData();
    }
    if (currentRoute === "fitness" && fitnessStatus === "idle") {
      loadFitnessData();
    }
  }

  function statusPill(label) {
    return `<span class="qapp-pill">${escapeHtml(label)}</span>`;
  }

  function previewText(value, maxLength = 180) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trim()}...`;
  }

  function isRawNoteMemory(card) {
    return String(card?.label || "").trim().toLowerCase() === "raw note";
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

  function defaultFitnessPlan() {
    return {
      name: "Full-Body Circuit",
      rounds: 5,
      exercises: [
        { id: "bench_press", name: "Bench Press", target: "8", weight: "105", unit: "lb" },
        { id: "push_ups", name: "Push-ups", target: "10-15", weight: "", unit: "reps" },
        { id: "dumbbell_curls", name: "Dumbbell Curls", target: "10 each arm", weight: "25", unit: "lb" },
        { id: "sit_ups", name: "Sit-ups", target: "15", weight: "", unit: "reps" },
        { id: "bodyweight_squats", name: "Bodyweight Squats", target: "15", weight: "", unit: "reps" },
        { id: "dumbbell_rows", name: "Bent-over Dumbbell Rows", target: "10 each arm", weight: "30", unit: "lb" },
        { id: "shoulder_press", name: "Shoulder Press", target: "10", weight: "25", unit: "lb" },
        { id: "plank", name: "Plank", target: "30 sec", weight: "", unit: "time" },
      ],
    };
  }

  function defaultFitnessState() {
    return {
      plan: defaultFitnessPlan(),
      sessions: [],
      prs: [],
      checkins: [],
      habits: ["Nicotine", "Alcohol", "Junk food", "Late sleep", "Doomscrolling"].map((name) => ({ name, isActive: true })),
      habitLogs: [],
    };
  }

  function loadFitnessState() {
    const defaults = defaultFitnessState();
    try {
      const saved = JSON.parse(window.localStorage.getItem(fitnessStorageKey) || "null") || {};
      return {
        ...defaults,
        ...saved,
        plan: {
          ...defaults.plan,
          ...(saved.plan || {}),
          exercises: Array.isArray(saved.plan?.exercises) && saved.plan.exercises.length
            ? saved.plan.exercises
            : defaults.plan.exercises,
        },
        sessions: Array.isArray(saved.sessions) ? saved.sessions : defaults.sessions,
        prs: Array.isArray(saved.prs) ? saved.prs : defaults.prs,
        checkins: Array.isArray(saved.checkins) ? saved.checkins : defaults.checkins,
        habits: Array.isArray(saved.habits) && saved.habits.length
          ? saved.habits.map((habit) => typeof habit === "string" ? { name: habit, isActive: true } : habit)
          : defaults.habits,
        habitLogs: Array.isArray(saved.habitLogs) ? saved.habitLogs : defaults.habitLogs,
      };
    } catch (error) {
      return defaults;
    }
  }

  function saveFitnessState() {
    window.localStorage.setItem(fitnessStorageKey, JSON.stringify(fitnessState));
  }

  function fitnessTodayKey() {
    return toDateKey(new Date());
  }

  function normalizeFitnessTemplate(row) {
    if (!row) return null;
    return {
      id: row.id || "",
      name: row.name || "Workout Plan",
      description: row.description || "",
      rounds: Number(row.rounds || 1),
      exercises: Array.isArray(row.exercises) && row.exercises.length ? row.exercises : defaultFitnessPlan().exercises,
      isActive: row.is_active !== false,
    };
  }

  function normalizeFitnessSession(row) {
    return {
      id: row.id || "",
      date: row.started_at || row.date || row.created_at || new Date().toISOString(),
      completedAt: row.completed_at || "",
      completedSets: Number(row.completed_sets || row.completedSets || 0),
      totalSets: Number(row.total_sets || row.totalSets || 0),
      summary: `${Number(row.completed_sets || row.completedSets || 0)}/${Number(row.total_sets || row.totalSets || 0)} sets · ${(row.detected_prs || row.detectedPrs || []).length} PR${(row.detected_prs || row.detectedPrs || []).length === 1 ? "" : "s"}`,
      planName: row.template_name || row.planName || "",
      exercises: Array.isArray(row.exercises) ? row.exercises : [],
      detectedPrs: Array.isArray(row.detected_prs || row.detectedPrs) ? row.detected_prs || row.detectedPrs : [],
      energy: row.energy || "",
      mood: row.mood || "",
      soreness: row.soreness || "",
      note: row.notes || row.note || "",
    };
  }

  function normalizeFitnessPr(row) {
    return {
      id: row.id || "",
      date: row.recorded_at || row.date || row.created_at || new Date().toISOString(),
      exercise: row.exercise || "",
      value: row.value || "",
      e1rm: Number(row.e1rm || 0),
      source: row.source || "manual",
      note: row.notes || row.note || "",
    };
  }

  function normalizeFitnessCheckin(row) {
    return {
      id: row.id || "",
      date: row.checked_at || row.date || row.created_at || new Date().toISOString(),
      energy: row.energy || "",
      mood: row.mood || "",
      soreness: row.soreness || "",
      sleep: row.sleep || "",
      note: row.notes || row.note || "",
    };
  }

  function normalizeFitnessHabit(row) {
    return {
      id: row.id || "",
      name: row.name || row.habit || "",
      category: row.category || "manual",
      isActive: row.is_active !== false,
    };
  }

  function normalizeFitnessHabitLog(row) {
    return {
      id: row.id || "",
      habitId: row.habit_id || "",
      habit: row.habit || "",
      date: row.logged_at || row.date || row.created_at || new Date().toISOString(),
      note: row.notes || row.note || "",
    };
  }

  function applyFitnessPayload(payload) {
    const templates = Array.isArray(payload.templates) ? payload.templates.map(normalizeFitnessTemplate).filter(Boolean) : [];
    const activeTemplate = templates.find((template) => template.isActive) || templates[0] || null;
    fitnessState = {
      ...fitnessState,
      plan: activeTemplate || fitnessState.plan || defaultFitnessPlan(),
      templates,
      sessions: Array.isArray(payload.sessions) ? payload.sessions.map(normalizeFitnessSession) : [],
      prs: Array.isArray(payload.prs) ? payload.prs.map(normalizeFitnessPr) : [],
      checkins: Array.isArray(payload.checkins) ? payload.checkins.map(normalizeFitnessCheckin) : [],
      habits: Array.isArray(payload.habits) && payload.habits.length
        ? payload.habits.map(normalizeFitnessHabit).filter((habit) => habit.name)
        : defaultFitnessState().habits,
      habitLogs: Array.isArray(payload.habitLogs) ? payload.habitLogs.map(normalizeFitnessHabitLog) : [],
    };
    saveFitnessState();
  }

  async function loadFitnessData() {
    fitnessStatus = "loading";
    fitnessError = "";
    render();
    try {
      const payload = await apiJson("/api/fitness");
      if (!Array.isArray(payload.templates) || !payload.templates.length) {
        const plan = defaultFitnessPlan();
        await apiJson("/api/fitness?resource=template", {
          method: "POST",
          body: {
            name: plan.name,
            rounds: plan.rounds,
            exercises: plan.exercises,
            isActive: true,
          },
        });
        applyFitnessPayload(await apiJson("/api/fitness"));
      } else {
        applyFitnessPayload(payload);
      }
      fitnessStatus = "ready";
    } catch (error) {
      fitnessStatus = "error";
      fitnessError = error?.message || "Unable to load fitness data.";
    }
    render();
  }

  async function saveFitnessResource(resource, body, method = "POST") {
    const payload = await apiJson(`/api/fitness?resource=${encodeURIComponent(resource)}`, {
      method,
      body,
    });
    try {
      applyFitnessPayload(await apiJson("/api/fitness"));
    } catch (error) {
      saveFitnessState();
    }
    return payload;
  }

  function targetReps(value) {
    const match = String(value || "").match(/\d+/);
    return match ? Number(match[0]) : 0;
  }

  function exerciseWeight(exercise) {
    const weight = Number(exercise?.weight);
    return Number.isFinite(weight) ? weight : 0;
  }

  function estimatedOneRepMax(weight, reps) {
    const weightNumber = Number(weight);
    const repNumber = Number(reps);
    if (!weightNumber || !repNumber) return 0;
    return Math.round(weightNumber * (1 + repNumber / 30));
  }

  function startFitnessWorkout() {
    fitnessState.activeWorkout = {
      id: `workout_${Date.now()}`,
      date: new Date().toISOString(),
      planName: fitnessState.plan.name,
      exerciseIndex: 0,
      restUntil: 0,
      detectedPrs: [],
      exercises: fitnessState.plan.exercises.map((exercise) => ({
        ...exercise,
        sets: Array.from({ length: fitnessState.plan.rounds }, () => ({
          weight: exerciseWeight(exercise),
          reps: targetReps(exercise.target),
          done: false,
        })),
      })),
    };
    fitnessMode = "active-workout";
    saveFitnessState();
  }

  function activeFitnessExercise() {
    const workout = fitnessState.activeWorkout;
    if (!workout?.exercises?.length) return null;
    return workout.exercises[Math.min(workout.exerciseIndex || 0, workout.exercises.length - 1)];
  }

  function activeFitnessSetIndex(exercise) {
    if (!exercise?.sets?.length) return 0;
    const next = exercise.sets.findIndex((set) => !set.done);
    return next === -1 ? exercise.sets.length - 1 : next;
  }

  function activeFitnessSet() {
    const exercise = activeFitnessExercise();
    if (!exercise) return null;
    return exercise.sets[activeFitnessSetIndex(exercise)];
  }

  function completedWorkoutSetCount(workout = fitnessState.activeWorkout) {
    return (workout?.exercises || []).reduce((count, exercise) => (
      count + (exercise.sets || []).filter((set) => set.done).length
    ), 0);
  }

  function totalWorkoutSetCount(workout = fitnessState.activeWorkout) {
    return (workout?.exercises || []).reduce((count, exercise) => count + (exercise.sets || []).length, 0);
  }

  function bestExercisePr(exerciseName) {
    return fitnessState.prs
      .filter((pr) => String(pr.exercise || "").toLowerCase() === String(exerciseName || "").toLowerCase())
      .map((pr) => ({ ...pr, e1rm: Number(pr.e1rm || 0) }))
      .sort((a, b) => b.e1rm - a.e1rm)[0] || null;
  }

  function detectFitnessPr(exercise, set) {
    const weight = Number(set?.weight);
    const reps = Number(set?.reps);
    if (!exercise || !weight || !reps) return null;
    const e1rm = estimatedOneRepMax(weight, reps);
    const current = bestExercisePr(exercise.name);
    if (current && Number(current.e1rm || 0) >= e1rm) return null;
    return {
      id: `pr_${Date.now()}_${exercise.id}`,
      date: new Date().toISOString(),
      exercise: exercise.name,
      value: `${weight} ${exercise.unit || "lb"} x ${reps}`,
      e1rm,
      note: "Detected during workout",
      source: "auto",
    };
  }

  function fitnessRestRemaining() {
    const restUntil = Number(fitnessState.activeWorkout?.restUntil || 0);
    return Math.max(0, Math.ceil((restUntil - Date.now()) / 1000));
  }

  function formatFitnessRest(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
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

  function cleanDateInput(value) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
    const date = dateFromKey(text);
    return date ? text : "";
  }

  function formatBirthday(value) {
    const date = dateFromKey(value);
    if (!date) return "Not saved";
    return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  function possessiveName(name) {
    const cleanName = String(name || "").trim();
    if (!cleanName) return "Birthday";
    return /s$/i.test(cleanName) ? `${cleanName}'` : `${cleanName}'s`;
  }

  function birthdayEventsForRange(startDate, endDate) {
    const start = dateFromKey(toDateKey(startDate));
    const end = dateFromKey(toDateKey(endDate));
    if (!start || !end) return [];
    const events = [];
    notebook.people.forEach((person) => {
      const birthday = cleanDateInput(person.birthday || person.metadata?.birthday);
      if (!birthday) return;
      const [, month, day] = birthday.split("-").map(Number);
      for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
        const eventDate = new Date(year, month - 1, day);
        if (eventDate < start || eventDate > end) continue;
        const dateKey = toDateKey(eventDate);
        events.push({
          id: `birthday-${person.id}-${dateKey}`,
          title: `${possessiveName(person.name)} birthday`,
          description: "Birthday from People Notebook.",
          starts_at: `${dateKey}T12:00:00`,
          ends_at: null,
          all_day: true,
          status: "confirmed",
          source: "people_birthday",
          person_id: person.id,
          metadata: { person_id: person.id, birthday },
        });
      }
    });
    return events;
  }

  function visibleCalendarEvents() {
    const start = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    const end = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 2, 0, 23, 59, 59);
    return [...calendarEvents, ...birthdayEventsForRange(start, end)];
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

  function qappReviewSuggestionsModal(review) {
    return new Promise((resolve) => {
      const memoryCards = Array.isArray(review.memoryCards) ? review.memoryCards : [];
      const reminders = Array.isArray(review.reminders) ? review.reminders : [];
      const overlay = document.createElement("div");
      overlay.className = "qapp-modal-overlay";
      overlay.innerHTML = `
        <section class="qapp-modal qapp-review-suggestions-modal" role="dialog" aria-modal="true" aria-labelledby="qappReviewSuggestionsTitle">
          <div class="qapp-modal-header">
            <h2 id="qappReviewSuggestionsTitle">Review Conversation Finds</h2>
            <p>${escapeHtml(`Scanned ${review.reviewedConversationCount || 1} conversation${Number(review.reviewedConversationCount) === 1 ? "" : "s"}. Choose what should become durable memory or follow-up tasks.`)}</p>
          </div>
          <div class="qapp-review-grid">
            <div class="qapp-review-card">
              <h4>Durable Memories</h4>
              ${memoryCards.length ? memoryCards.map((card, index) => `
                <label class="qapp-check-row">
                  <input data-review-memory-index="${index}" type="checkbox" checked>
                  <span>
                    <strong>${escapeHtml(card.label || "Memory")}</strong>
                    <small>${escapeHtml(card.value || "")}</small>
                  </span>
                </label>
              `).join("") : `<p>No new durable memory candidates found.</p>`}
            </div>
            <div class="qapp-review-card">
              <h4>Follow-Ups / Tasks</h4>
              ${reminders.length ? reminders.map((reminder, index) => `
                <label class="qapp-check-row">
                  <input data-review-reminder-index="${index}" type="checkbox" checked>
                  <span>
                    <strong>${escapeHtml(reminder.title || "Follow up")}</strong>
                    <small>${escapeHtml([reminder.remindAt ? formatDateTime(reminder.remindAt, "") : "", reminder.details || ""].filter(Boolean).join(" - ") || "Follow-up candidate")}</small>
                  </span>
                </label>
              `).join("") : `<p>No follow-up candidates found.</p>`}
            </div>
          </div>
          <div class="qapp-modal-actions">
            <button class="qapp-modal-cancel" type="button">Cancel</button>
            <button class="qapp-modal-confirm" type="button">Save Selected</button>
          </div>
        </section>
      `;

      function close(result) {
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        resolve(result);
      }

      function readSelection() {
        return {
          memoryCards: [...overlay.querySelectorAll("[data-review-memory-index]:checked")]
            .map((input) => memoryCards[Number(input.dataset.reviewMemoryIndex)])
            .filter(Boolean),
          reminders: [...overlay.querySelectorAll("[data-review-reminder-index]:checked")]
            .map((input) => reminders[Number(input.dataset.reviewReminderIndex)])
            .filter(Boolean),
        };
      }

      function onKeydown(event) {
        if (event.key === "Escape") close(null);
      }

      overlay.querySelector(".qapp-modal-cancel")?.addEventListener("click", () => close(null));
      overlay.querySelector(".qapp-modal-confirm")?.addEventListener("click", () => close(readSelection()));
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close(null);
      });
      document.addEventListener("keydown", onKeydown);
      document.body.appendChild(overlay);
      setTimeout(() => overlay.querySelector(".qapp-modal-confirm")?.focus(), 0);
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
      metadata: person.metadata && typeof person.metadata === "object" ? person.metadata : {},
      birthday: cleanDateInput(person.birthday || person.metadata?.birthday),
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
        due: reminder.remind_at ? formatDateTime(reminder.remind_at, "Scheduled") : "Soon",
      })),
      interactions: interactions.map((interaction) => ({
        id: interaction.id || "",
        occurred_at: interaction.occurred_at || "",
        date: formatDateTime(interaction.occurred_at),
        location: interaction.location || "Not specified",
        mood: interaction.mood || "",
        notes: interaction.notes || interaction.ai_summary || "",
        topics: Array.isArray(interaction.topics) ? interaction.topics : [],
        metadata: interaction.metadata && typeof interaction.metadata === "object" ? interaction.metadata : {},
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

  async function loadTasksData() {
    tasksStatus = "loading";
    tasksError = "";
    render();
    try {
      const payload = await apiJson("/api/tasks");
      tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
      tasksStatus = "ready";
    } catch (error) {
      tasksStatus = "error";
      tasksError = error?.message || "Unable to load tasks.";
    }
    render();
  }

  function flattenedFollowUps() {
    return notebook.people
      .flatMap((person) => person.reminders.map((reminder) => ({ ...reminder, person })))
      .filter((item) => item.status === "open")
      .sort((a, b) => {
        const left = a.remind_at ? new Date(a.remind_at).getTime() : Number.POSITIVE_INFINITY;
        const right = b.remind_at ? new Date(b.remind_at).getTime() : Number.POSITIVE_INFINITY;
        return left - right || String(a.title).localeCompare(String(b.title));
      });
  }

  function followUpStatus(reminder) {
    if (!reminder.remind_at) return "Unscheduled";
    const dueKey = toDateKey(reminder.remind_at);
    const todayKey = toDateKey(new Date());
    if (dueKey < todayKey) return "Overdue";
    if (dueKey === todayKey) return "Today";
    return "Upcoming";
  }

  function renderToday() {
    const peopleCount = notebook.people.length;
    const followUps = flattenedFollowUps();
    const reminderCount = followUps.length;
    const visibleFollowUps = followUps.slice(0, 6);
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
            <h3>Scheduled Follow-Ups</h3>
          </div>
          ${statusPill(notebookStatus === "ready" ? "Supabase" : "Loading")}
        </div>
        <div class="qapp-reminder-list">
          ${visibleFollowUps.length ? visibleFollowUps.map((item) => `
            <div class="qapp-reminder">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(`${followUpStatus(item)}: ${item.due}`)}${item.details ? ` - ${escapeHtml(item.details)}` : ""}</span>
              <div class="qapp-item-actions">
                <button data-today-action="open-person" data-person-id="${escapeHtml(item.person.id)}" type="button">Open Profile</button>
              </div>
            </div>
          `).join("") : `<div class="qapp-reminder"><strong>No open follow-ups</strong><span>People reminders with date/time will show here.</span></div>`}
        </div>
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

  function reminderAgeState(reminder) {
    if (!reminder.remind_at) return "unscheduled";
    const due = new Date(reminder.remind_at);
    if (!Number.isFinite(due.getTime())) return "unscheduled";
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dueStart = new Date(due);
    dueStart.setHours(0, 0, 0, 0);
    const dayDiff = Math.floor((todayStart - dueStart) / 86400000);
    if (dayDiff > 7) return "stale";
    if (dayDiff > 0) return "overdue";
    if (dayDiff === 0) return "today";
    return "upcoming";
  }

  function durableMemoryCards(person) {
    const temporaryLabels = new Set(["upcoming event", "visit context", "appointment", "reminder"]);
    return person.memoryCards.filter((card) => !temporaryLabels.has(String(card.label || "").trim().toLowerCase()));
  }

  function renderConversationPrep(person) {
    const latestInteraction = person.interactions[0];
    const latestNote = latestInteraction?.notes || "";
    const activeReminders = person.reminders
      .filter((reminder) => reminder.status === "open")
      .filter((reminder) => reminderAgeState(reminder) !== "stale")
      .slice(0, 3);
    const staleReminders = person.reminders
      .filter((reminder) => reminder.status === "open" && reminderAgeState(reminder) === "stale")
      .slice(0, 2);
    const durableMemories = durableMemoryCards(person).slice(0, 3);

    return `
      <div class="qapp-subsection-title">
        <h4>Before You Talk</h4>
        <span>${activeReminders.length + staleReminders.length}</span>
      </div>
      <div class="qapp-memory-list">
        <div class="qapp-memory-card qapp-last-conversation-card">
          <span>Last Conversation</span>
          ${latestInteraction ? `
            <details class="qapp-last-conversation">
              <summary>
                <strong>${escapeHtml(previewText(latestNote))}</strong>
                <small>Expand</small>
              </summary>
              <p>${escapeHtml(latestNote)}</p>
            </details>
          ` : `<strong>No conversation saved yet.</strong>`}
          ${latestInteraction ? `<small>${escapeHtml(`${latestInteraction.date} - ${latestInteraction.location}`)}</small>` : ""}
        </div>
        ${activeReminders.length ? activeReminders.map((reminder) => `
          <div class="qapp-memory-card">
            <span>${escapeHtml(reminderAgeState(reminder) === "overdue" ? "Follow up now" : "Ask about")}</span>
            <strong>${escapeHtml(reminder.title)}</strong>
            <small>${escapeHtml(reminder.due)}${reminder.details ? ` - ${escapeHtml(reminder.details)}` : ""}</small>
          </div>
        `).join("") : `<div class="qapp-memory-card"><span>Open Follow-Ups</span><strong>No current follow-up queued.</strong></div>`}
        ${staleReminders.length ? staleReminders.map((reminder) => `
          <div class="qapp-memory-card">
            <span>Possibly outdated</span>
            <strong>${escapeHtml(reminder.title)}</strong>
            <small>${escapeHtml(`Was due ${reminder.due}. Ask how it went, then close or update it.`)}</small>
          </div>
        `).join("") : ""}
        ${durableMemories.length ? `
          <div class="qapp-memory-card">
            <span>Steady Context</span>
            <strong>${durableMemories.map((card) => `${card.label}: ${card.value}`).map(escapeHtml).join("<br>")}</strong>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderPersonProfile(person) {
    const durableMemories = durableMemoryCards(person);
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
            <span><strong>Birthday</strong>${escapeHtml(formatBirthday(person.birthday))}</span>
          </div>
          <div class="qapp-action-row">
            <button class="qapp-inline-button" data-action="add-note-for-person" data-person-id="${escapeHtml(person.id)}" type="button">Add Conversation</button>
            <button class="qapp-soft-button" data-action="refresh-overview" data-person-id="${escapeHtml(person.id)}" type="button">Refresh Overview</button>
            <button class="qapp-soft-button" data-action="edit-person" data-person-id="${escapeHtml(person.id)}" type="button">Edit Profile</button>
            <button class="qapp-danger-button" data-action="delete-person" data-person-id="${escapeHtml(person.id)}" type="button">Delete Profile</button>
          </div>
          ${renderConversationPrep(person)}
          <div class="qapp-subsection-title">
            <h4>Durable Memory Cards</h4>
            <span>${durableMemories.length}</span>
          </div>
          <div class="qapp-memory-list">
            ${durableMemories.length ? durableMemories.map((card) => `
              <div class="qapp-memory-card">
                <span>${escapeHtml(card.label)}</span>
                <strong>${escapeHtml(card.value)}</strong>
                ${card.id ? `<div class="qapp-item-actions">
                  <button data-action="edit-memory" data-item-id="${escapeHtml(card.id)}" type="button">Edit</button>
                  <button data-action="delete-memory" data-item-id="${escapeHtml(card.id)}" type="button">Delete</button>
                </div>` : ""}
              </div>
            `).join("") : `<div class="qapp-memory-card"><span>Durable Memory</span><strong>No long-term facts saved yet.</strong></div>`}
          </div>
          <div class="qapp-subsection-title">
            <h4>Conversation Log</h4>
            <div class="qapp-subsection-actions">
              <button data-action="review-all-conversations" data-person-id="${escapeHtml(person.id)}" type="button">Scan All</button>
              <span>${person.interactions.length}</span>
            </div>
          </div>
          <div class="qapp-interaction-log">
            ${person.interactions.length ? person.interactions.map((interaction) => `
              <div class="qapp-log-entry">
                <span>${escapeHtml(interaction.date)} - ${escapeHtml(interaction.location)}</span>
                <p>${escapeHtml(interaction.notes)}</p>
                <div class="qapp-tag-row">${interaction.topics.map(statusPill).join("")}</div>
                ${interaction.id ? `<div class="qapp-item-actions">
                  <button data-action="review-interaction" data-item-id="${escapeHtml(interaction.id)}" type="button">Scan</button>
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
            ${possiblePeople.length ? possiblePeople.map((person, index) => `
              <div class="qapp-check-row">
                <input name="draftNewPeopleIndexes" type="checkbox" value="${index}" ${Number(person.confidence) >= 0.75 ? "checked" : ""}>
                <span class="qapp-inline-edit-fields">
                  <input name="draftNewPeopleName${index}" type="text" value="${escapeHtml(person.name)}" aria-label="New profile name">
                  <small>${escapeHtml(confidencePercent(person.confidence) || "Possible new person")}</small>
                </span>
              </div>
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
              <div class="qapp-check-row">
                <input name="draftMemoryIndexes" type="checkbox" value="${index}" checked>
                <span class="qapp-inline-edit-fields">
                  <input name="draftMemoryLabel${index}" type="text" value="${escapeHtml(card.label)}" aria-label="Memory label">
                  <textarea name="draftMemoryValue${index}" rows="2" aria-label="Memory value">${escapeHtml(card.value)}</textarea>
                </span>
              </div>
            `).join("") : `<p>No memory cards suggested.</p>`}
          </div>
          <div class="qapp-review-card">
            <h4>Follow-Ups</h4>
            ${reminders.length ? reminders.map((reminder, index) => `
              <div class="qapp-check-row">
                <input name="draftReminderIndexes" type="checkbox" value="${index}" checked>
                <span class="qapp-inline-edit-fields">
                  <input name="draftReminderTitle${index}" type="text" value="${escapeHtml(reminder.title)}" aria-label="Follow-up title">
                  <textarea name="draftReminderDetails${index}" rows="2" aria-label="Follow-up details">${escapeHtml(reminder.details || "")}</textarea>
                  <input name="draftReminderAt${index}" type="datetime-local" value="${escapeHtml(toDateTimeLocal(reminder.remindAt || reminder.remind_at || ""))}" aria-label="Follow-up date and time">
                </span>
              </div>
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
                  <span>Birthday</span>
                  <input name="birthday" type="date" value="${escapeHtml(selectedPerson?.birthday || "")}">
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
                  <span>Conversation date/time</span>
                  <input name="occurredAt" type="datetime-local" value="${escapeHtml(toDateTimeLocal(new Date().toISOString()))}">
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
                  <span>Reminder date/time</span>
                  <input name="remindAt" type="datetime-local">
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
    return visibleCalendarEvents()
      .filter((event) => toDateKey(event.starts_at) === dateKey && event.status !== "cancelled")
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }

  function tasksForDate(dateKey) {
    return tasks
      .filter((task) => !taskIsDone(task) && taskDueKey(task) === dateKey)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
  }

  function formatTaskTime(task) {
    if (!task.due_at) return "Task";
    const date = new Date(task.due_at);
    if (!Number.isFinite(date.getTime())) return "Task";
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
    const selectedTasks = tasksForDate(selectedCalendarDate);
    const allVisibleEvents = visibleCalendarEvents();
    const upcomingEvents = allVisibleEvents
      .filter((event) => event.status !== "cancelled" && new Date(event.starts_at) >= new Date(new Date().setHours(0, 0, 0, 0)))
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .slice(0, 5);
    const dayCells = Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      const dateKey = toDateKey(date);
      const dayEvents = eventsForDate(dateKey);
      const dayTasks = tasksForDate(dateKey);
      const dayItems = [
        ...dayEvents.slice(0, 2).map((event) => ({ type: "event", label: event.title })),
        ...dayTasks.slice(0, Math.max(0, 3 - Math.min(dayEvents.length, 2))).map((task) => ({ type: "task", label: task.title })),
      ];
      const overflowCount = Math.max(0, dayEvents.length + dayTasks.length - dayItems.length);
      const inMonth = date.getMonth() === calendarCursor.getMonth();
      return `
        <button class="qapp-calendar-day ${inMonth ? "" : "is-muted"} ${dateKey === todayKey ? "is-today" : ""} ${dateKey === selectedCalendarDate ? "is-selected" : ""}" data-calendar-action="select-day" data-date="${dateKey}" type="button">
          <span>${date.getDate()}</span>
          ${dayItems.map((item) => `<small>${item.type === "task" ? "Task: " : ""}${escapeHtml(item.label)}</small>`).join("")}
          ${overflowCount ? `<em>+${overflowCount}</em>` : ""}
        </button>
      `;
    }).join("");

    return `
      <section class="qapp-calendar-shell">
        <div class="qapp-calendar-toolbar">
          <div>
            <h3>${escapeHtml(monthLabel(calendarCursor))}</h3>
            <p>${allVisibleEvents.length} event${allVisibleEvents.length === 1 ? "" : "s"} loaded</p>
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
              ${statusPill(`${selectedEvents.length + selectedTasks.length}`)}
            </div>
            <div class="qapp-calendar-event-list">
              ${selectedEvents.length ? selectedEvents.map((event) => `
                <article class="qapp-calendar-event">
                  <span>${escapeHtml(formatEventTime(event))}</span>
                  <button class="qapp-calendar-event-title" data-calendar-action="${event.source === "people_birthday" ? "open-person" : "edit-event"}" data-event-id="${escapeHtml(event.id)}" data-person-id="${escapeHtml(event.person_id || event.metadata?.person_id || "")}" type="button">${escapeHtml(event.title)}</button>
                  ${event.location ? `<p>${escapeHtml(event.location)}</p>` : ""}
                  ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ""}
                  ${event.source === "people_birthday" ? `<div class="qapp-tag-row">${statusPill("Birthday")}${statusPill("People")}</div>` : `<div class="qapp-item-actions">
                    <button data-calendar-action="edit-event" data-event-id="${escapeHtml(event.id)}" type="button">Edit</button>
                    <button data-calendar-action="delete-event" data-event-id="${escapeHtml(event.id)}" type="button">Delete</button>
                  </div>`}
                </article>
              `).join("") : ""}
              ${selectedTasks.length ? selectedTasks.map((task) => `
                <article class="qapp-calendar-event">
                  <span>${escapeHtml(formatTaskTime(task))}</span>
                  <button class="qapp-calendar-event-title" data-calendar-action="open-task" data-task-id="${escapeHtml(task.id)}" type="button">${escapeHtml(task.title)}</button>
                  ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
                  <div class="qapp-tag-row">
                    ${statusPill("Task")}
                    ${task.source === "people_follow_up" ? statusPill("People") : ""}
                  </div>
                  <div class="qapp-item-actions">
                    <button data-calendar-action="open-task" data-task-id="${escapeHtml(task.id)}" type="button">Open Task</button>
                  </div>
                </article>
              `).join("") : ""}
              ${!selectedEvents.length && !selectedTasks.length ? `<article class="qapp-calendar-event"><strong>No events or tasks</strong><p>Add an event, create a task, or choose another day.</p></article>` : ""}
            </div>
            <div class="qapp-subsection-title">
              <h4>Upcoming</h4>
              <span>${upcomingEvents.length}</span>
            </div>
            <div class="qapp-calendar-event-list">
              ${upcomingEvents.length ? upcomingEvents.map((event) => `
                <button class="qapp-calendar-upcoming" data-calendar-action="${event.source === "people_birthday" ? "open-person" : "edit-event"}" data-event-id="${escapeHtml(event.id)}" data-person-id="${escapeHtml(event.person_id || event.metadata?.person_id || "")}" type="button">
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

  function taskIsDone(task) {
    return task.status === "done" || task.status === "archived";
  }

  function taskDueKey(task) {
    return task.due_at ? toDateKey(task.due_at) : "";
  }

  function formatTaskDue(task) {
    if (!task.due_at) return "No due date";
    const date = new Date(task.due_at);
    if (!Number.isFinite(date.getTime())) return "No due date";
    const today = toDateKey(new Date());
    const dueKey = toDateKey(date);
    const prefix = dueKey < today && !taskIsDone(task) ? "Overdue: " : dueKey === today ? "Today: " : "Due ";
    return `${prefix}${date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  function sortTasksForList(taskList) {
    return [...taskList].sort((a, b) => {
      if (taskIsDone(a) !== taskIsDone(b)) return taskIsDone(a) ? 1 : -1;
      const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }

  function renderTaskCard(task) {
    const done = taskIsDone(task);
    return `
      <article class="qapp-task-card ${done ? "is-done" : ""}">
        <div>
          <div class="qapp-task-title-row">
            <strong>${escapeHtml(task.title)}</strong>
            <span class="qapp-task-priority qapp-task-priority--${escapeHtml(task.priority || "normal")}">${escapeHtml(task.priority || "normal")}</span>
          </div>
          <p>${escapeHtml(formatTaskDue(task))}</p>
          ${task.description ? `<p>${escapeHtml(task.description)}</p>` : ""}
          <div class="qapp-tag-row">
            ${statusPill(task.status || "todo")}
            ${task.source === "ai_assistant" ? statusPill("AI") : ""}
          </div>
        </div>
        <div class="qapp-item-actions">
          ${done
            ? `<button data-task-action="reopen-task" data-task-id="${escapeHtml(task.id)}" type="button">Reopen</button>`
            : `<button data-task-action="complete-task" data-task-id="${escapeHtml(task.id)}" type="button">Done</button>`}
          <button data-task-action="edit-task" data-task-id="${escapeHtml(task.id)}" type="button">Edit</button>
          <button data-task-action="delete-task" data-task-id="${escapeHtml(task.id)}" type="button">Delete</button>
        </div>
      </article>
    `;
  }

  function renderTaskGroup(title, taskList, emptyCopy) {
    return `
      <section class="qapp-panel qapp-task-section">
        <div class="qapp-panel-title-row">
          <h3>${escapeHtml(title)}</h3>
          ${statusPill(String(taskList.length))}
        </div>
        <div class="qapp-task-list">
          ${taskList.length ? taskList.map(renderTaskCard).join("") : `<article class="qapp-task-card"><strong>${escapeHtml(emptyCopy)}</strong></article>`}
        </div>
      </section>
    `;
  }

  function renderTaskForm() {
    const editingTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) : null;
    const selectedStatus = editingTask?.status || "todo";
    const selectedPriority = editingTask?.priority || "normal";
    return `
      <section class="qapp-panel">
        <button class="qapp-text-button" data-task-action="back-list" type="button">Back to tasks</button>
        <form id="qappTaskForm" class="qapp-capture-form">
          <input name="id" type="hidden" value="${escapeHtml(editingTask?.id || "")}">
          <div class="qapp-form-section">
            <div class="qapp-form-section-title">
              <h3>${editingTask ? "Edit task" : "New task"}</h3>
            </div>
            <label>
              <span>Title</span>
              <input name="title" type="text" value="${escapeHtml(editingTask?.title || "")}" placeholder="What needs to happen?" required>
            </label>
            <div class="qapp-capture-grid">
              <label>
                <span>Due</span>
                <input name="dueAt" type="datetime-local" value="${escapeHtml(toDateTimeLocal(editingTask?.due_at || ""))}">
              </label>
              <label>
                <span>Priority</span>
                <select name="priority">
                  ${["low", "normal", "high", "urgent"].map((priority) => `
                    <option value="${priority}" ${selectedPriority === priority ? "selected" : ""}>${priority}</option>
                  `).join("")}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select name="status">
                  ${["todo", "in_progress", "done", "archived"].map((status) => `
                    <option value="${status}" ${selectedStatus === status ? "selected" : ""}>${status}</option>
                  `).join("")}
                </select>
              </label>
            </div>
            <label>
              <span>Notes</span>
              <textarea name="description" rows="4" placeholder="Context, links, or why it matters">${escapeHtml(editingTask?.description || "")}</textarea>
            </label>
          </div>
          <div class="qapp-action-row">
            <button type="submit">${editingTask ? "Save Task" : "Create Task"}</button>
            ${editingTask ? `<button class="qapp-danger-button" data-task-action="delete-task" data-task-id="${escapeHtml(editingTask.id)}" type="button">Delete Task</button>` : ""}
          </div>
        </form>
      </section>
    `;
  }

  function renderTasks() {
    if (tasksStatus === "idle" || tasksStatus === "loading") {
      return `<section class="qapp-panel"><p>Loading tasks...</p></section>`;
    }

    if (tasksStatus === "error") {
      return `
        <section class="qapp-panel">
          <div class="qapp-panel-title-row">
            <h3>Tasks load failed</h3>
            ${statusPill("Error")}
          </div>
          <p>${escapeHtml(tasksError)}</p>
          <button class="qapp-inline-button" data-task-action="reload" type="button">Try Again</button>
        </section>
      `;
    }

    if (tasksMode === "form") {
      return renderTaskForm();
    }

    const todayKey = toDateKey(new Date());
    const sorted = sortTasksForList(tasks);
    const todayTasks = sorted.filter((task) => !taskIsDone(task) && taskDueKey(task) && taskDueKey(task) <= todayKey);
    const upcomingTasks = sorted.filter((task) => !taskIsDone(task) && (!taskDueKey(task) || taskDueKey(task) > todayKey));
    const doneTasks = sorted.filter(taskIsDone).slice(0, 12);

    return `
      <section class="qapp-panel qapp-tasks-toolbar">
        <div>
          <h3>Tasks</h3>
          <p>${tasks.length} task${tasks.length === 1 ? "" : "s"} saved</p>
        </div>
        <div class="qapp-action-row">
          <button class="qapp-soft-button" data-task-action="reload" type="button">Reload</button>
          <button class="qapp-inline-button" data-task-action="new-task" type="button">Add Task</button>
        </div>
      </section>
      <div class="qapp-task-board">
        ${renderTaskGroup("Today & Overdue", todayTasks, "Nothing due right now.")}
        ${renderTaskGroup("Upcoming", upcomingTasks, "No upcoming tasks.")}
        ${renderTaskGroup("Done", doneTasks, "No completed tasks yet.")}
      </div>
    `;
  }

  function renderFitnessHeader(title, subtitle = "") {
    return `
      <section class="qapp-panel qapp-fitness-head">
        <button class="qapp-text-button" data-fitness-action="home" type="button">Back to fitness</button>
        <div>
          <h3>${escapeHtml(title)}</h3>
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}
        </div>
      </section>
    `;
  }

  function renderFitnessHome() {
    const latestSession = fitnessState.sessions[0];
    const latestCheckin = fitnessState.checkins[0];
    const recentHabitCount = fitnessState.habitLogs.filter((log) => toDateKey(log.date) === fitnessTodayKey()).length;
    if (fitnessStatus === "loading") {
      return `<section class="qapp-panel"><p>Loading fitness data...</p></section>`;
    }
    if (fitnessStatus === "error") {
      return `
        <section class="qapp-panel">
          <div class="qapp-panel-title-row">
            <h3>Fitness load failed</h3>
            ${statusPill("Error")}
          </div>
          <p>${escapeHtml(fitnessError)}</p>
          <button class="qapp-inline-button" data-fitness-action="reload" type="button">Try Again</button>
        </section>
      `;
    }
    const options = [
      { mode: "workout", title: "Start Workout", copy: `${fitnessState.plan.name} · ${fitnessState.plan.rounds} rounds` },
      { mode: "prs", title: "Log PR", copy: "Save a best lift, reps, run time, or note." },
      { mode: "checkin", title: "How I Feel", copy: latestCheckin ? `Last: energy ${latestCheckin.energy}/5, soreness ${latestCheckin.soreness}/5` : "Energy, mood, soreness, sleep." },
      { mode: "habits", title: "Habits", copy: `${fitnessState.habits.length} saved choices · ${recentHabitCount} logged today` },
      { mode: "history", title: "History", copy: `${fitnessState.sessions.length} workout${fitnessState.sessions.length === 1 ? "" : "s"} saved` },
      { mode: "trends", title: "Trends", copy: "Volume, PR, check-in, and habit patterns." },
      { mode: "settings", title: "Workout Plan", copy: "Edit exercises, targets, weights, and rounds." },
    ];
    return `
      <section class="qapp-grid qapp-grid--stats">
        <article class="qapp-panel">
          <span class="qapp-stat">${fitnessState.sessions.length}</span>
          <h3>Workouts</h3>
          <p>${latestSession ? `Last: ${formatDate(latestSession.date)}` : "No workouts logged yet."}</p>
        </article>
        <article class="qapp-panel">
          <span class="qapp-stat">${fitnessState.prs.length}</span>
          <h3>PRs</h3>
          <p>Manual records saved from quick PR logging.</p>
        </article>
        <article class="qapp-panel">
          <span class="qapp-stat">${fitnessState.checkins.length}</span>
          <h3>Check-ins</h3>
          <p>Energy, mood, soreness, and sleep history.</p>
        </article>
      </section>
      <section class="qapp-fitness-options">
        ${options.map((option) => `
          <button class="qapp-fitness-option" data-fitness-mode="${escapeHtml(option.mode)}" type="button">
            <strong>${escapeHtml(option.title)}</strong>
            <span>${escapeHtml(option.copy)}</span>
          </button>
        `).join("")}
      </section>
    `;
  }

  function renderFitnessWorkout() {
    return `
      ${renderFitnessHeader("Start Workout", "Review the plan, then enter workout mode.")}
      <section class="qapp-panel qapp-wide-panel">
        <div class="qapp-panel-title-row">
          <div>
            <h3>${escapeHtml(fitnessState.plan.name)}</h3>
            <p>${escapeHtml(`${fitnessState.plan.rounds} rounds · ${fitnessState.plan.exercises.length} exercises`)}</p>
          </div>
          ${statusPill(fitnessState.activeWorkout ? "Resume Ready" : "Ready")}
        </div>
        <div class="qapp-fitness-plan-list">
          ${fitnessState.plan.exercises.map((exercise) => `
            <div class="qapp-fitness-plan-row">
              <span>
                <strong>${escapeHtml(exercise.name)}</strong>
                <small>${escapeHtml(`${exercise.target}${exercise.weight ? ` · ${exercise.weight} ${exercise.unit}` : ""}`)}</small>
              </span>
            </div>
          `).join("")}
        </div>
        <div class="qapp-action-row">
          <button data-fitness-action="${fitnessState.activeWorkout ? "resume-workout" : "start-workout"}" type="button">${fitnessState.activeWorkout ? "Resume Workout" : "Begin Workout"}</button>
          ${fitnessState.activeWorkout ? `<button class="qapp-danger-button" data-fitness-action="discard-workout" type="button">Discard</button>` : ""}
        </div>
      </section>
    `;
  }

  function renderFitnessActiveWorkout() {
    const workout = fitnessState.activeWorkout;
    const exercise = activeFitnessExercise();
    const setIndex = activeFitnessSetIndex(exercise);
    const set = activeFitnessSet();
    const restSeconds = fitnessRestRemaining();
    if (!workout || !exercise || !set) {
      return `
        ${renderFitnessHeader("Workout", "No active workout is loaded.")}
        <section class="qapp-panel"><button data-fitness-action="start-workout" type="button">Start Workout</button></section>
      `;
    }
    const completedSets = completedWorkoutSetCount(workout);
    const totalSets = totalWorkoutSetCount(workout);
    return `
      <section class="qapp-fitness-workout-shell">
        <div class="qapp-fitness-workout-top">
          <button class="qapp-text-button" data-fitness-mode="workout" type="button">Plan</button>
          <span>${escapeHtml(`${completedSets}/${totalSets} sets`)}</span>
          <button class="qapp-text-button" data-fitness-action="finish-workout" type="button">Finish</button>
        </div>
        <section class="qapp-panel qapp-fitness-active-card">
          <div class="qapp-panel-title-row">
            <div>
              <p class="qapp-kicker">${escapeHtml(`Exercise ${Number(workout.exerciseIndex || 0) + 1} of ${workout.exercises.length}`)}</p>
              <h3>${escapeHtml(exercise.name)}</h3>
              <p>${escapeHtml(`Set ${setIndex + 1} of ${exercise.sets.length} · target ${exercise.target}`)}</p>
            </div>
            ${statusPill(exercise.weight ? `${exercise.weight} ${exercise.unit}` : exercise.unit || "bodyweight")}
          </div>
          <div class="qapp-fitness-set-editor">
            <div>
              <span>Weight</span>
              <strong>${escapeHtml(set.weight || 0)}</strong>
              <div class="qapp-stepper-row">
                <button data-fitness-action="adjust-weight" data-delta="-5" type="button">-5</button>
                <button data-fitness-action="adjust-weight" data-delta="5" type="button">+5</button>
              </div>
            </div>
            <div>
              <span>Reps</span>
              <strong>${escapeHtml(set.reps || 0)}</strong>
              <div class="qapp-stepper-row">
                <button data-fitness-action="adjust-reps" data-delta="-1" type="button">-1</button>
                <button data-fitness-action="adjust-reps" data-delta="1" type="button">+1</button>
              </div>
            </div>
          </div>
          ${restSeconds ? `<div class="qapp-fitness-rest"><span>Rest</span><strong>${escapeHtml(formatFitnessRest(restSeconds))}</strong><button data-fitness-action="skip-rest" type="button">Skip</button></div>` : ""}
          <div class="qapp-action-row">
            <button data-fitness-action="complete-set" type="button">Done</button>
            <button class="qapp-soft-button" data-fitness-action="prev-exercise" type="button">Prev</button>
            <button class="qapp-soft-button" data-fitness-action="next-exercise" type="button">Next</button>
          </div>
        </section>
        <section class="qapp-fitness-set-strip">
          ${exercise.sets.map((item, index) => `
            <button class="${item.done ? "is-done" : ""} ${index === setIndex ? "is-active" : ""}" data-fitness-action="select-set" data-set-index="${index}" type="button">
              <strong>${index + 1}</strong>
              <span>${escapeHtml(item.done ? `${item.weight || 0} x ${item.reps || 0}` : "Open")}</span>
            </button>
          `).join("")}
        </section>
      </section>
    `;
  }

  function renderFitnessPostWorkout() {
    const workout = fitnessState.activeWorkout;
    const detected = workout?.detectedPrs || [];
    return `
      ${renderFitnessHeader("Finish Workout", "Save the session with a quick recovery note.")}
      <section class="qapp-panel">
        <form id="qappFitnessFinishForm" class="qapp-capture-form">
          <div class="qapp-grid qapp-grid--stats">
            <article class="qapp-memory-card"><span>Sets</span><strong>${completedWorkoutSetCount(workout)}/${totalWorkoutSetCount(workout)}</strong></article>
            <article class="qapp-memory-card"><span>Detected PRs</span><strong>${detected.length}</strong></article>
            <article class="qapp-memory-card"><span>Plan</span><strong>${escapeHtml(workout?.planName || fitnessState.plan.name)}</strong></article>
          </div>
          <div class="qapp-capture-grid">
            ${["energy", "mood", "soreness"].map((field) => `
              <label><span>${escapeHtml(field.charAt(0).toUpperCase() + field.slice(1))}</span><input name="${field}" type="range" min="1" max="5" value="3"></label>
            `).join("")}
          </div>
          <label><span>Notes</span><textarea name="note" rows="3" placeholder="How it felt, pain, form cues, what to change next time..."></textarea></label>
          <button type="submit">Save Session</button>
        </form>
      </section>
    `;
  }

  function renderFitnessPrs() {
    const sortedPrs = [...fitnessState.prs].sort((a, b) => new Date(b.date) - new Date(a.date));
    return `
      ${renderFitnessHeader("PRs", "Log records quickly without starting a workout.")}
      <section class="qapp-panel">
        <form id="qappFitnessPrForm" class="qapp-capture-form">
          <div class="qapp-capture-grid">
            <label><span>Exercise</span><input name="exercise" type="text" placeholder="Bench Press" required></label>
            <label><span>Record</span><input name="value" type="text" placeholder="135 lb x 5" required></label>
          </div>
          <label><span>Note</span><textarea name="note" rows="3" placeholder="How it felt, setup, form cue..."></textarea></label>
          <button type="submit">Save PR</button>
        </form>
      </section>
      <section class="qapp-list">
        ${sortedPrs.length ? sortedPrs.map((pr) => `
          <article class="qapp-memory-card">
            <span>${escapeHtml(`${formatDate(pr.date)}${pr.source === "auto" ? " · detected" : ""}`)}</span>
            <strong>${escapeHtml(`${pr.exercise}: ${pr.value}`)}</strong>
            ${pr.e1rm ? `<small>${escapeHtml(`Estimated 1RM: ${pr.e1rm}`)}</small>` : ""}
            ${pr.note ? `<small>${escapeHtml(pr.note)}</small>` : ""}
          </article>
        `).join("") : `<article class="qapp-panel"><h3>No PRs yet</h3><p>Save a record and it will show here.</p></article>`}
      </section>
    `;
  }

  function renderFitnessCheckin() {
    return `
      ${renderFitnessHeader("How I Feel", "A short recovery check-in separate from workout logging.")}
      <section class="qapp-panel">
        <form id="qappFitnessCheckinForm" class="qapp-capture-form">
          <div class="qapp-capture-grid">
            ${["energy", "mood", "soreness", "sleep"].map((field) => `
              <label><span>${escapeHtml(field.charAt(0).toUpperCase() + field.slice(1))}</span><input name="${field}" type="range" min="1" max="5" value="3"></label>
            `).join("")}
          </div>
          <label><span>Notes</span><textarea name="note" rows="3" placeholder="Sore spots, motivation, stress, sleep details..."></textarea></label>
          <button type="submit">Save Check-in</button>
        </form>
      </section>
    `;
  }

  function renderFitnessHabits() {
    return `
      ${renderFitnessHeader("Habits", "Manual choices you can reselect later.")}
      <section class="qapp-panel">
        <form id="qappFitnessHabitForm" class="qapp-capture-form">
          <div class="qapp-fitness-habit-grid">
            ${fitnessState.habits.map((habit) => `
              <label class="qapp-check-row">
                <input name="habits" type="checkbox" value="${escapeHtml(habit.name)}" data-habit-id="${escapeHtml(habit.id || "")}">
                <span><strong>${escapeHtml(habit.name)}</strong><small>${fitnessState.habitLogs.filter((log) => log.habit === habit.name).length} logs</small></span>
              </label>
            `).join("")}
          </div>
          <div class="qapp-capture-grid">
            <label><span>Add option</span><input name="newHabit" type="text" placeholder="Example: skipped stretching"></label>
            <label><span>Context</span><input name="note" type="text" placeholder="Optional note"></label>
          </div>
          <button type="submit">Save Habit Log</button>
        </form>
      </section>
    `;
  }

  function renderFitnessHistory() {
    const rows = [
      ...fitnessState.sessions.map((item) => ({
        type: "Workout",
        date: item.date,
        title: item.summary || `${item.completed?.length || 0}/${fitnessState.plan.exercises.length} exercises`,
        note: item.note || "",
      })),
      ...fitnessState.checkins.map((item) => ({ type: "Check-in", date: item.date, title: `Energy ${item.energy}/5 · Mood ${item.mood}/5`, note: item.note || "" })),
      ...fitnessState.habitLogs.map((item) => ({ type: "Habit", date: item.date, title: item.habit, note: item.note || "" })),
      ...fitnessState.prs.map((item) => ({ type: "PR", date: item.date, title: `${item.exercise}: ${item.value}`, note: item.note || "" })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 40);
    return `
      ${renderFitnessHeader("History", "Recent workouts, check-ins, habits, and PRs.")}
      <section class="qapp-list">
        ${rows.length ? rows.map((row) => `
          <article class="qapp-memory-card">
            <span>${escapeHtml(`${row.type} · ${formatDate(row.date)}`)}</span>
            <strong>${escapeHtml(row.title)}</strong>
            ${row.note ? `<small>${escapeHtml(row.note)}</small>` : ""}
          </article>
        `).join("") : `<article class="qapp-panel"><h3>No history yet</h3><p>Use one of the Fitness options to start logging.</p></article>`}
      </section>
    `;
  }

  function renderFitnessTrends() {
    const recentSessions = fitnessState.sessions.slice(0, 8);
    const recentCheckins = fitnessState.checkins.slice(0, 8);
    const habitCounts = fitnessState.habitLogs.reduce((counts, log) => {
      counts.set(log.habit, (counts.get(log.habit) || 0) + 1);
      return counts;
    }, new Map());
    const topHabits = [...habitCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    return `
      ${renderFitnessHeader("Trends", "Compact progress signals from your saved data.")}
      <section class="qapp-grid qapp-grid--stats">
        <article class="qapp-panel"><span class="qapp-stat">${fitnessState.sessions.length}</span><h3>Sessions</h3><p>Total workouts saved.</p></article>
        <article class="qapp-panel"><span class="qapp-stat">${fitnessState.prs.length}</span><h3>PRs</h3><p>Manual and detected records.</p></article>
        <article class="qapp-panel"><span class="qapp-stat">${fitnessState.habitLogs.length}</span><h3>Habit Logs</h3><p>Manual behavior entries.</p></article>
      </section>
      <section class="qapp-grid">
        <article class="qapp-panel">
          <h3>Workout Volume</h3>
          <div class="qapp-fitness-bars">
            ${recentSessions.length ? recentSessions.map((session) => {
              const percent = Math.min(100, Math.round((Number(session.completedSets || 0) / Math.max(1, Number(session.totalSets || 1))) * 100));
              return `<div><span>${escapeHtml(formatDate(session.date))}</span><strong style="width:${percent}%"></strong><em>${percent}%</em></div>`;
            }).join("") : `<p>No sessions yet.</p>`}
          </div>
        </article>
        <article class="qapp-panel">
          <h3>Recovery</h3>
          <div class="qapp-fitness-bars">
            ${recentCheckins.length ? recentCheckins.map((checkin) => {
              const score = Math.round(((Number(checkin.energy || 0) + Number(checkin.mood || 0) + Math.max(0, 6 - Number(checkin.soreness || 0))) / 15) * 100);
              return `<div><span>${escapeHtml(formatDate(checkin.date))}</span><strong style="width:${score}%"></strong><em>${score}%</em></div>`;
            }).join("") : `<p>No check-ins yet.</p>`}
          </div>
        </article>
        <article class="qapp-panel">
          <h3>Top Habits</h3>
          <div class="qapp-fitness-list">
            ${topHabits.length ? topHabits.map(([habit, count]) => `<div class="qapp-memory-card"><span>${escapeHtml(habit)}</span><strong>${count} log${count === 1 ? "" : "s"}</strong></div>`).join("") : `<p>No habit logs yet.</p>`}
          </div>
        </article>
      </section>
    `;
  }

  function renderFitnessSettings() {
    const rows = [...fitnessState.plan.exercises, ...Array.from({ length: 3 }, () => ({ name: "", target: "", weight: "", unit: "" }))];
    return `
      ${renderFitnessHeader("Workout Plan", "Edit the default routine without touching history.")}
      <section class="qapp-panel">
        <form id="qappFitnessPlanForm" class="qapp-capture-form">
          <div class="qapp-capture-grid">
            <label><span>Plan name</span><input name="name" type="text" value="${escapeHtml(fitnessState.plan.name)}"></label>
            <label><span>Rounds</span><input name="rounds" type="number" min="1" max="20" value="${escapeHtml(fitnessState.plan.rounds)}"></label>
          </div>
          <div class="qapp-fitness-plan-editor">
            ${rows.map((exercise, index) => `
              <div class="qapp-fitness-plan-edit-row">
                <input name="exerciseName${index}" type="text" value="${escapeHtml(exercise.name)}" placeholder="Exercise">
                <input name="exerciseTarget${index}" type="text" value="${escapeHtml(exercise.target)}" placeholder="Target">
                <input name="exerciseWeight${index}" type="number" min="0" step="5" value="${escapeHtml(exercise.weight)}" placeholder="Weight">
                <input name="exerciseUnit${index}" type="text" value="${escapeHtml(exercise.unit)}" placeholder="Unit">
              </div>
            `).join("")}
          </div>
          <button type="submit">Save Plan</button>
        </form>
      </section>
    `;
  }

  function renderFitness() {
    if (fitnessMode === "workout") return renderFitnessWorkout();
    if (fitnessMode === "active-workout") return renderFitnessActiveWorkout();
    if (fitnessMode === "post-workout") return renderFitnessPostWorkout();
    if (fitnessMode === "prs") return renderFitnessPrs();
    if (fitnessMode === "checkin") return renderFitnessCheckin();
    if (fitnessMode === "habits") return renderFitnessHabits();
    if (fitnessMode === "history") return renderFitnessHistory();
    if (fitnessMode === "trends") return renderFitnessTrends();
    if (fitnessMode === "settings") return renderFitnessSettings();
    return renderFitnessHome();
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
      bindTodayForms();
    } else if (currentRoute === "people") {
      view.innerHTML = renderPeople();
      bindPeopleForms();
    } else if (currentRoute === "calendar") {
      view.innerHTML = renderCalendar();
      bindCalendarForms();
    } else if (currentRoute === "tasks") {
      view.innerHTML = renderTasks();
      bindTaskForms();
    } else if (currentRoute === "fitness") {
      view.innerHTML = renderFitness();
      bindFitnessForms();
    } else if (currentRoute === "notes") {
      view.innerHTML = renderPlaceholder("notes", "Capture", "Notes", "Notes will hold quick thoughts, planning entries, and raw material before AI organizes it.", [
        { title: "Quick Note", status: "Planned", copy: "Capture a thought without deciding where it belongs yet." },
        { title: "Daily Plan", status: "Planned", copy: "Write or generate a plan before the next day starts." },
        { title: "Archive", status: "Planned", copy: "Search old entries and promote important details into AI context." },
      ]);
    } else if (currentRoute === "ai") {
      view.innerHTML = renderAiAssistant();
    } else {
      currentRoute = "today";
      view.innerHTML = renderToday();
      bindTodayForms();
    }
    syncFitnessTimer();
  }

  function syncFitnessTimer() {
    window.clearInterval(fitnessTimerId);
    fitnessTimerId = 0;
    if (currentRoute !== "fitness" || fitnessMode !== "active-workout" || !fitnessRestRemaining()) return;
    fitnessTimerId = window.setInterval(() => {
      if (!fitnessRestRemaining()) {
        window.clearInterval(fitnessTimerId);
        fitnessTimerId = 0;
      }
      render();
    }, 1000);
  }

  function bindTodayForms() {
    [...document.querySelectorAll('[data-today-action="open-person"]')].forEach((button) => {
      button.addEventListener("click", () => {
        selectedPersonId = button.dataset.personId || "";
        peopleMode = selectedPersonId ? "profile" : "list";
        setRoute("people");
      });
    });
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
        if (action === "open-person") {
          const personId = button.dataset.personId || "";
          if (!personId) return;
          selectedPersonId = personId;
          peopleMode = "profile";
          setRoute("people");
          return;
        }
        if (action === "open-task") {
          editingTaskId = button.dataset.taskId || "";
          tasksMode = editingTaskId ? "form" : "list";
          setRoute("tasks");
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

  function taskPayloadFromForm(form) {
    const formData = new FormData(form);
    const status = String(formData.get("status") || "todo");
    return {
      id: String(formData.get("id") || "").trim(),
      title: String(formData.get("title") || "").trim(),
      description: String(formData.get("description") || "").trim(),
      dueAt: fromDateTimeLocal(formData.get("dueAt")),
      priority: String(formData.get("priority") || "normal"),
      status,
      completedAt: status === "done" ? new Date().toISOString() : "",
    };
  }

  async function patchTaskStatus(task, status) {
    await apiJson("/api/tasks", {
      method: "PATCH",
      body: {
        id: task.id,
        title: task.title,
        description: task.description || "",
        dueAt: task.due_at || "",
        priority: task.priority || "normal",
        status,
        completedAt: status === "done" ? new Date().toISOString() : "",
        metadata: task.metadata || {},
        source: task.source || "dashboard",
      },
    });
  }

  function bindTaskForms() {
    const taskButtons = [...document.querySelectorAll("[data-task-action]")];
    const form = document.getElementById("qappTaskForm");

    taskButtons.forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.taskAction || "";
        const taskId = button.dataset.taskId || "";
        const task = taskId ? tasks.find((item) => item.id === taskId) : null;

        if (action === "reload") {
          loadTasksData();
          return;
        }
        if (action === "new-task") {
          editingTaskId = "";
          tasksMode = "form";
          render();
          return;
        }
        if (action === "edit-task") {
          editingTaskId = taskId;
          tasksMode = "form";
          render();
          return;
        }
        if (action === "back-list") {
          editingTaskId = "";
          tasksMode = "list";
          render();
          return;
        }
        if (action === "complete-task" && task) {
          button.disabled = true;
          try {
            await patchTaskStatus(task, "done");
            await loadTasksData();
          } catch (error) {
            await qappAlert(error?.message || "Unable to complete task.", "Task error");
            button.disabled = false;
          }
          return;
        }
        if (action === "reopen-task" && task) {
          button.disabled = true;
          try {
            await patchTaskStatus(task, "todo");
            await loadTasksData();
          } catch (error) {
            await qappAlert(error?.message || "Unable to reopen task.", "Task error");
            button.disabled = false;
          }
          return;
        }
        if (action === "delete-task") {
          if (!taskId) return;
          if (!await qappConfirm("Delete this task?", "Delete task", { confirmLabel: "Delete", danger: true })) return;
          try {
            await apiJson("/api/tasks", { method: "DELETE", body: { id: taskId } });
            editingTaskId = "";
            tasksMode = "list";
            await loadTasksData();
          } catch (error) {
            await qappAlert(error?.message || "Unable to delete task.", "Task error");
          }
        }
      });
    });

    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const payload = taskPayloadFromForm(form);
      if (!payload.title) {
        await qappAlert("Task title is required.", "Task");
        return;
      }
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
      try {
        await apiJson("/api/tasks", {
          method: payload.id ? "PATCH" : "POST",
          body: payload,
        });
        editingTaskId = "";
        tasksMode = "list";
        await loadTasksData();
      } catch (error) {
        await qappAlert(error?.message || "Unable to save task.", "Task error");
        submitButton.disabled = false;
        submitButton.textContent = payload.id ? "Save Task" : "Create Task";
      }
    });
  }

  function bindFitnessForms() {
    [...document.querySelectorAll("[data-fitness-mode]")].forEach((button) => {
      button.addEventListener("click", () => {
        fitnessMode = button.dataset.fitnessMode || "home";
        render();
      });
    });

    [...document.querySelectorAll("[data-fitness-action]")].forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.fitnessAction || "";
        if (action === "reload") {
          fitnessStatus = "idle";
          await loadFitnessData();
          return;
        }
        if (action === "home") {
          fitnessMode = "home";
          render();
          return;
        }
        if (action === "start-workout") {
          startFitnessWorkout();
          render();
          return;
        }
        if (action === "resume-workout") {
          fitnessMode = "active-workout";
          render();
          return;
        }
        if (action === "discard-workout") {
          if (!await qappConfirm("Discard the active workout?", "Discard workout", { confirmLabel: "Discard", danger: true })) return;
          fitnessState.activeWorkout = null;
          saveFitnessState();
          fitnessMode = "home";
          render();
          return;
        }
        if (action === "adjust-weight" || action === "adjust-reps") {
          const set = activeFitnessSet();
          if (!set) return;
          const field = action === "adjust-weight" ? "weight" : "reps";
          const delta = Number(button.dataset.delta || 0);
          set[field] = Math.max(0, Number(set[field] || 0) + delta);
          saveFitnessState();
          render();
          return;
        }
        if (action === "complete-set") {
          const exercise = activeFitnessExercise();
          const set = activeFitnessSet();
          if (!exercise || !set) return;
          set.done = true;
          const pr = detectFitnessPr(exercise, set);
          if (pr) {
            fitnessState.prs.unshift(pr);
            fitnessState.prs = fitnessState.prs.slice(0, 100);
            fitnessState.activeWorkout.detectedPrs = [pr, ...(fitnessState.activeWorkout.detectedPrs || [])];
            try {
              await saveFitnessResource("pr", {
                exercise: pr.exercise,
                value: pr.value,
                e1rm: pr.e1rm,
                source: "auto",
                note: pr.note,
                recordedAt: pr.date,
              });
            } catch (error) {
              fitnessError = error?.message || "Unable to sync detected PR.";
            }
          }
          fitnessState.activeWorkout.restUntil = Date.now() + 90000;
          const nextOpen = exercise.sets.findIndex((item) => !item.done);
          if (nextOpen === -1 && fitnessState.activeWorkout.exerciseIndex < fitnessState.activeWorkout.exercises.length - 1) {
            fitnessState.activeWorkout.exerciseIndex += 1;
            fitnessState.activeWorkout.restUntil = Date.now() + 90000;
          }
          saveFitnessState();
          render();
          return;
        }
        if (action === "skip-rest") {
          if (fitnessState.activeWorkout) fitnessState.activeWorkout.restUntil = 0;
          saveFitnessState();
          render();
          return;
        }
        if (action === "prev-exercise" || action === "next-exercise") {
          if (!fitnessState.activeWorkout) return;
          const delta = action === "prev-exercise" ? -1 : 1;
          const max = fitnessState.activeWorkout.exercises.length - 1;
          fitnessState.activeWorkout.exerciseIndex = Math.max(0, Math.min(max, Number(fitnessState.activeWorkout.exerciseIndex || 0) + delta));
          saveFitnessState();
          render();
          return;
        }
        if (action === "select-set") {
          const exercise = activeFitnessExercise();
          if (!exercise) return;
          const index = Number(button.dataset.setIndex || 0);
          exercise.sets.forEach((set, setIndex) => {
            if (setIndex >= index) set.done = false;
          });
          saveFitnessState();
          render();
          return;
        }
        if (action === "finish-workout") {
          fitnessMode = "post-workout";
          render();
        }
      });
    });

    const prForm = document.getElementById("qappFitnessPrForm");
    prForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(prForm);
      try {
        await saveFitnessResource("pr", {
          exercise: String(formData.get("exercise") || "").trim(),
          value: String(formData.get("value") || "").trim(),
          note: String(formData.get("note") || "").trim(),
        });
        render();
      } catch (error) {
        await qappAlert(error?.message || "Unable to save PR.", "Fitness");
      }
    });

    const checkinForm = document.getElementById("qappFitnessCheckinForm");
    checkinForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(checkinForm);
      try {
        await saveFitnessResource("checkin", {
          energy: String(formData.get("energy") || "3"),
          mood: String(formData.get("mood") || "3"),
          soreness: String(formData.get("soreness") || "3"),
          sleep: String(formData.get("sleep") || "3"),
          note: String(formData.get("note") || "").trim(),
        });
        fitnessMode = "home";
        render();
      } catch (error) {
        await qappAlert(error?.message || "Unable to save check-in.", "Fitness");
      }
    });

    const finishForm = document.getElementById("qappFitnessFinishForm");
    finishForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const workout = fitnessState.activeWorkout;
      if (!workout) return;
      const formData = new FormData(finishForm);
      const completedSets = completedWorkoutSetCount(workout);
      const totalSets = totalWorkoutSetCount(workout);
      const summary = `${completedSets}/${totalSets} sets · ${workout.detectedPrs?.length || 0} PR${workout.detectedPrs?.length === 1 ? "" : "s"}`;
      try {
        await saveFitnessResource("session", {
          templateId: fitnessState.plan.id || "",
          templateName: workout.planName,
          startedAt: workout.date,
          completedAt: new Date().toISOString(),
          completedSets,
          totalSets,
          exercises: workout.exercises,
          detectedPrs: workout.detectedPrs || [],
          energy: String(formData.get("energy") || "3"),
          mood: String(formData.get("mood") || "3"),
          soreness: String(formData.get("soreness") || "3"),
          note: String(formData.get("note") || "").trim(),
        });
        await saveFitnessResource("checkin", {
          energy: String(formData.get("energy") || "3"),
          mood: String(formData.get("mood") || "3"),
          soreness: String(formData.get("soreness") || "3"),
          note: String(formData.get("note") || "").trim(),
        });
        fitnessState.activeWorkout = null;
        saveFitnessState();
        fitnessMode = "home";
        await loadFitnessData();
      } catch (error) {
        await qappAlert(error?.message || "Unable to save session.", "Fitness");
      }
    });

    const habitForm = document.getElementById("qappFitnessHabitForm");
    habitForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(habitForm);
      const newHabit = String(formData.get("newHabit") || "").trim();
      const note = String(formData.get("note") || "").trim();
      const selected = formData.getAll("habits").map((value) => String(value || "").trim()).filter(Boolean);
      if (newHabit && !selected.some((habit) => habit.toLowerCase() === newHabit.toLowerCase())) {
        selected.push(newHabit);
      }
      try {
        let createdHabit = null;
        if (newHabit && !fitnessState.habits.some((habit) => habit.name.toLowerCase() === newHabit.toLowerCase())) {
          const payload = await saveFitnessResource("habit", { name: newHabit });
          createdHabit = normalizeFitnessHabit(payload.habit);
        }
        for (const habitName of selected) {
          const habit = fitnessState.habits.find((item) => item.name.toLowerCase() === habitName.toLowerCase())
            || (createdHabit?.name?.toLowerCase() === habitName.toLowerCase() ? createdHabit : null);
          await saveFitnessResource("habitLog", {
            habitId: habit?.id || "",
            habit: habitName,
            note,
          });
        }
        render();
      } catch (error) {
        await qappAlert(error?.message || "Unable to save habit log.", "Fitness");
      }
    });

    const planForm = document.getElementById("qappFitnessPlanForm");
    planForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(planForm);
      const exercises = Array.from({ length: fitnessState.plan.exercises.length + 3 }, (_, index) => {
          const name = String(formData.get(`exerciseName${index}`) || "").trim();
          const target = String(formData.get(`exerciseTarget${index}`) || "").trim();
          const weight = String(formData.get(`exerciseWeight${index}`) || "").trim();
          const unit = String(formData.get(`exerciseUnit${index}`) || "").trim();
          return name ? { id: `exercise_${index}_${name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, name, target, weight, unit } : null;
        })
        .filter(Boolean);
      const plan = {
        name: String(formData.get("name") || "Workout Plan").trim(),
        rounds: Math.max(1, Number(formData.get("rounds") || 1)),
        exercises: exercises.length ? exercises : fitnessState.plan.exercises,
      };
      try {
        await saveFitnessResource("template", {
          id: fitnessState.plan.id || "",
          ...plan,
          isActive: true,
        }, fitnessState.plan.id ? "PATCH" : "POST");
        fitnessMode = "home";
        render();
      } catch (error) {
        await qappAlert(error?.message || "Unable to save workout plan.", "Fitness");
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
    const refreshOverviewButton = document.querySelector('[data-action="refresh-overview"]');
    const reviewAllConversationsButton = document.querySelector('[data-action="review-all-conversations"]');
    const editPersonButton = document.querySelector('[data-action="edit-person"]');
    const deletePersonButton = document.querySelector('[data-action="delete-person"]');
    const itemActionButtons = [...document.querySelectorAll("[data-item-id]")];
    const activePerson = selectedPersonId ? notebook.people.find((person) => person.id === selectedPersonId) : null;

    async function reviewConversationCandidates(button, interactionId = "") {
      if (!activePerson) return;
      const originalText = button?.textContent || "";
      if (button) {
        button.disabled = true;
        button.textContent = "Scanning...";
      }
      try {
        const review = await apiJson("/api/relationship-review", {
          method: "POST",
          body: {
            mode: "review",
            personId: activePerson.id,
            interactionId,
          },
        });
        if (!review.memoryCards?.length && !review.reminders?.length) {
          await qappAlert("No new durable memories or follow-ups were found.", "Conversation Scan");
          return;
        }
        const selection = await qappReviewSuggestionsModal(review);
        if (!selection) return;
        if (!selection.memoryCards.length && !selection.reminders.length) {
          await qappAlert("Nothing selected to save.", "Conversation Scan");
          return;
        }
        const result = await apiJson("/api/relationship-review", {
          method: "POST",
          body: {
            mode: "apply",
            personId: activePerson.id,
            interactionId,
            memoryCards: selection.memoryCards,
            reminders: selection.reminders,
          },
        });
        await loadNotebookData();
        selectedPersonId = activePerson.id;
        peopleMode = "profile";
        render();
        const counts = [
          `${result.memoryCards?.length || 0} memories`,
          `${result.reminders?.length || 0} follow-ups`,
          `${result.linkedTasks?.length || 0} tasks`,
        ].join(", ");
        if (result.overviewError) {
          await qappAlert(`Saved ${counts}. Overview refresh did not complete.\n\n${result.overviewError}`, "Conversation Scan");
        }
      } catch (error) {
        await qappAlert(error?.message || "Unable to scan conversation.", "Conversation Scan");
      } finally {
        if (button?.isConnected) {
          button.disabled = false;
          button.textContent = originalText || "Scan";
        }
      }
    }

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

    if (refreshOverviewButton && activePerson) {
      refreshOverviewButton.addEventListener("click", async () => {
        const originalText = refreshOverviewButton.textContent;
        refreshOverviewButton.disabled = true;
        refreshOverviewButton.textContent = "Refreshing...";
        try {
          await apiJson(`/api/person-overview?person_id=${encodeURIComponent(activePerson.id)}`, {
            method: "POST",
            body: { personId: activePerson.id, id: activePerson.id },
          });
          await loadNotebookData();
          selectedPersonId = activePerson.id;
          peopleMode = "profile";
          render();
        } catch (error) {
          await qappAlert(error?.message || "Unable to refresh overview.", "Profile error");
          refreshOverviewButton.disabled = false;
          refreshOverviewButton.textContent = originalText || "Refresh Overview";
        }
      });
    }

    if (reviewAllConversationsButton && activePerson) {
      reviewAllConversationsButton.addEventListener("click", () => {
        reviewConversationCandidates(reviewAllConversationsButton);
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
            { label: "Birthday", value: activePerson.birthday || "", type: "date" },
            { label: "Tags, comma separated", value: (activePerson.tags || []).join(", ") },
            { label: "Overview", value: activePerson.overview || activePerson.summary || "", type: "textarea", rows: 4 },
          ],
          confirmLabel: "Save Profile",
        });
        if (!values) return;
        const [name, email, phone, firstMetLocation, birthday, tagText, overview] = values;
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
              metadata: {
                ...(activePerson.metadata || {}),
                birthday: cleanDateInput(birthday),
              },
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
          if (action === "review-interaction" && interaction) {
            await reviewConversationCandidates(button, interaction.id);
            return;
          }

          if (type === "interaction") {
            if (isDelete) {
              if (!await qappConfirm("Delete this conversation entry?", "Delete conversation", { confirmLabel: "Delete", danger: true })) return;
              await apiJson("/api/person-interactions", { method: "DELETE", body: { id: itemId } });
            } else if (interaction) {
              const values = await qappModal({
                title: "Edit conversation",
                fields: [
                  { label: "Conversation notes", value: interaction.notes || "", type: "textarea", rows: 5 },
                  { label: "Conversation date/time", value: toDateTimeLocal(interaction.occurred_at || ""), type: "datetime-local" },
                  { label: "Location", value: interaction.location || "" },
                  { label: "Topics, comma separated", value: (interaction.topics || []).join(", ") },
                ],
                confirmLabel: "Save Conversation",
              });
              if (!values) return;
              const [rawNotes, occurredAt, location, topicText] = values;
              const notes = cleanStructuredNoteText(rawNotes);
              if (!notes) return;
              const topics = String(topicText || "")
                .split(",")
                .map((topic) => topic.trim())
                .filter(Boolean);
              await apiJson("/api/person-interactions", {
                method: "PATCH",
                body: {
                  id: itemId,
                  notes,
                  occurredAt: fromDateTimeLocal(occurredAt),
                  location,
                  topics,
                  mood: interaction.mood || "",
                  metadata: {
                    ...(interaction.metadata || {}),
                    date_corrected_from_app: true,
                  },
                },
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
                  { label: "Remind date/time", value: toDateTimeLocal(reminder.remind_at || ""), type: "datetime-local" },
                ],
                confirmLabel: "Save Follow-Up",
              });
              if (!values) return;
              const [title, details, remindAt] = values;
              if (!title) return;
              await apiJson("/api/relationship-items", {
                method: "PATCH",
                body: { type: "reminder", id: itemId, title, details, remindAt: fromDateTimeLocal(remindAt), status: reminder.status || "open", priority: reminder.priority || "normal" },
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
        const note = cleanStructuredNoteText(new FormData(form).get("note"));
        if (!note) return;
        relationshipCaptureNote = note;
        if (noteInput) noteInput.value = note;
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
    noteInput?.addEventListener("paste", () => {
      window.setTimeout(() => {
        const cleaned = cleanStructuredNoteText(noteInput.value);
        if (cleaned && cleaned !== noteInput.value.trim()) {
          noteInput.value = cleaned;
          relationshipCaptureNote = cleaned;
        }
      }, 0);
    });
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
      const note = cleanStructuredNoteText(formData.get("note"));
      if (!note) return;
      if (noteInput) noteInput.value = note;
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
      const remindAt = fromDateTimeLocal(formData.get("remindAt"));
      const birthday = cleanDateInput(formData.get("birthday"));
      const draftPersonIds = formData.getAll("draftPersonIds").map((value) => String(value || "").trim()).filter(Boolean);
      const draftNewPeopleIndexes = new Set(formData.getAll("draftNewPeopleIndexes").map((value) => Number(value)));
      const draftNewPeople = Array.isArray(relationshipDraft?.possiblePeople)
        ? relationshipDraft.possiblePeople
            .map((_, index) => draftNewPeopleIndexes.has(index)
              ? String(formData.get(`draftNewPeopleName${index}`) || "").trim()
              : "")
            .filter(Boolean)
        : [];
      const draftMemoryIndexes = new Set(formData.getAll("draftMemoryIndexes").map((value) => Number(value)));
      const draftReminderIndexes = new Set(formData.getAll("draftReminderIndexes").map((value) => Number(value)));
      const draftInteraction = relationshipDraft?.interaction || {};
      const draftMemoryCards = Array.isArray(relationshipDraft?.memoryCards)
        ? relationshipDraft.memoryCards
            .map((card, index) => ({
              selected: draftMemoryIndexes.has(index),
              label: String(formData.get(`draftMemoryLabel${index}`) || card.label || "").trim(),
              value: String(formData.get(`draftMemoryValue${index}`) || card.value || "").trim(),
              confidence: Number.isFinite(Number(card.confidence)) ? Number(card.confidence) : 0.7,
            }))
            .filter((card) => card.selected)
            .filter((card) => card.label && card.value)
            .map(({ selected, ...card }) => card)
        : [];
      const draftReminders = Array.isArray(relationshipDraft?.reminders)
        ? relationshipDraft.reminders
            .map((reminder, index) => ({
              selected: draftReminderIndexes.has(index),
              title: String(formData.get(`draftReminderTitle${index}`) || reminder.title || "").trim(),
              details: String(formData.get(`draftReminderDetails${index}`) || reminder.details || "").trim(),
              remindAt: fromDateTimeLocal(formData.get(`draftReminderAt${index}`)) || String(reminder.remindAt || reminder.remind_at || "").trim(),
              priority: "normal",
            }))
            .filter((reminder) => reminder.selected)
            .filter((reminder) => reminder.title)
            .map(({ selected, ...reminder }) => reminder)
        : [];

      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
      try {
        const createPerson = async (personName) => {
          const created = await apiJson("/api/people", {
            method: "POST",
            body: {
              name: personName,
              tags: tags.length ? tags : ["Captured"],
              email: String(formData.get("email") || "").trim(),
              phone: String(formData.get("phone") || "").trim(),
              photoUrl: String(formData.get("photoUrl") || "").trim(),
              overview: String(formData.get("overview") || "").trim(),
              firstMetLocation,
              metadata: { birthday },
            },
          });
          return normalizePerson({ ...created.person, interactions: [], memoryCards: [], reminders: [] });
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
        const draftPeopleById = new Map((relationshipDraft?.people || []).map((person) => [person.id, person]));

        const saveResults = await Promise.all(peopleToSave.map((person) => {
          const personDraftCards = Array.isArray(draftPeopleById.get(person.id)?.memoryCards)
            ? draftPeopleById.get(person.id).memoryCards
            : null;
          const personDraftReminders = Array.isArray(draftPeopleById.get(person.id)?.reminders)
            ? draftPeopleById.get(person.id).reminders
            : null;
          const memoryCardsForPerson = personDraftCards ? personDraftCards : selectedMemoryCards;
          const remindersForPerson = personDraftReminders ? personDraftReminders : selectedReminders;
          return apiJson("/api/person-interactions", {
            method: "POST",
            body: {
              personId: person.id,
              occurredAt: fromDateTimeLocal(formData.get("occurredAt")) || new Date().toISOString(),
              location,
              notes: note,
              mood: String(formData.get("mood") || "").trim() || draftInteraction.mood || "",
              topics: selectedTopics,
              aiSummary: String(formData.get("aiSummary") || "").trim() || relationshipDraft?.summary || "",
              memoryCards: memoryCardsForPerson,
              reminders: remindersForPerson,
              metadata: {
                date_hint: draftInteraction.dateHint || "",
                captured_from_app_at: new Date().toISOString(),
              },
            },
          });
        }));
        const overviewErrors = saveResults
          .map((result, index) => result?.overviewError ? `${peopleToSave[index]?.name || "Profile"}: ${result.overviewError}` : "")
          .filter(Boolean);

        form.reset();
        relationshipCaptureNote = "";
        relationshipDraft = null;
        relationshipDraftStatus = "idle";
        relationshipDraftError = "";
        await loadNotebookData();
        selectedPersonId = peopleToSave[0]?.id || "";
        peopleMode = "profile";
        render();
        if (overviewErrors.length) {
          await qappAlert(
            `Conversation saved, but the AI overview did not update.\n\n${overviewErrors.join("\n")}`,
            "Overview refresh"
          );
        }
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
      setRoute(window.location.hash.replace("#", "") || currentRoute);
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
    if (data.type === "qapp:set-route") {
      setRoute(data.route);
      if (data.route === "tasks" && tasksStatus !== "loading") {
        await loadTasksData();
      }
      return;
    }
    if (data.type === "qapp:view-person-profile") {
      const personId = String(data.personId || "").trim();
      selectedPersonId = personId;
      peopleMode = personId ? "profile" : "list";
      setRoute("people");
      if (notebookStatus !== "loading") {
        await loadNotebookData();
        selectedPersonId = personId;
        peopleMode = personId ? "profile" : "list";
        render();
      }
      return;
    }
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
