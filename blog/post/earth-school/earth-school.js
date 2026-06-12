(function () {
  const sections = Array.from(document.querySelectorAll("[data-section]"));
  const chapterLinks = Array.from(document.querySelectorAll(".earth-chapter-link"));
  const openConsentButton = document.querySelector("[data-open-consent]");
  const acceptConsentButton = document.querySelector("[data-accept-consent]");
  const consentBackdrop = document.querySelector("[data-consent-backdrop]");
  const experienceBackdrop = document.querySelector("[data-experience-backdrop]");
  const experienceStepLabel = document.querySelector("[data-experience-step-label]");
  const experienceTitle = document.querySelector("[data-experience-title]");
  const experienceBody = document.querySelector("[data-experience-body]");
  const experienceDecision = document.querySelector("[data-experience-decision]");
  const experienceSequence = document.querySelector("[data-experience-sequence]");
  const experiencePrevButton = document.querySelector("[data-experience-prev]");
  const experienceNextButton = document.querySelector("[data-experience-next]");
  const enterBodyButton = document.querySelector("[data-choice-enter-body]");
  const completeExperienceButton = document.querySelector("[data-choice-complete]");
  const prevButton = document.querySelector("[data-prev-section]");
  const nextButton = document.querySelector("[data-next-section]");
  const progressFill = document.querySelector("[data-progress-fill]");
  const progressText = document.querySelector("[data-progress-text]");
  const guideRoot = document.querySelector("[data-guide-root]");
  const earthEntryCopy = document.querySelector("[data-earth-entry-copy]");
  const earthEntryActions = document.querySelector("[data-earth-entry-actions]");
  const earthAiBackdrop = document.querySelector("[data-earth-ai-backdrop]");
  const earthAiOpen = document.querySelector("[data-earth-ai-open]");
  const earthAiClose = document.querySelector("[data-earth-ai-close]");
  const earthAiLog = document.querySelector("[data-earth-ai-log]");
  const earthAiForm = document.querySelector("[data-earth-ai-form]");
  const earthAiInput = document.querySelector("[data-earth-ai-input]");
  const earthAiClear = document.querySelector("[data-earth-ai-clear]");

  if (!sections.length || !chapterLinks.length || !prevButton || !nextButton || !progressFill || !progressText || !guideRoot || !openConsentButton || !acceptConsentButton || !consentBackdrop || !experienceBackdrop || !experienceStepLabel || !experienceTitle || !experienceBody || !experienceDecision || !experienceSequence || !experiencePrevButton || !experienceNextButton || !enterBodyButton || !completeExperienceButton || !earthAiBackdrop || !earthAiOpen || !earthAiClose) {
    return;
  }

  let currentIndex = 0;
  let experienceIndex = 0;
  const earthAiStorageKey = "earth_school_ai_chat";
  const passageNumerals = ["I", "II", "III", "IV", "V", "VI"];
  const experienceStages = [
    {
      title: "Separation",
      points: [
        "awareness continues while the body is inactive",
        "you may feel removed from the form without immediately understanding what has happened",
        "disorientation is common at first, especially when the system is no longer being felt in the usual way"
      ]
    },
    {
      title: "Peace / Release",
      points: [
        "pressure begins to lift",
        "pain often disappears",
        "what remains is often described as relief, calm, safety, or a kind of peace more complete than ordinary Earth experience"
      ]
    },
    {
      title: "Transition / Movement",
      points: [
        "movement may begin without effort",
        "some describe darkness, tunnel, or light",
        "direction is often felt before it is understood, as though you are being carried toward another threshold"
      ]
    },
    {
      title: "Encounter / Environment",
      points: [
        "a different environment may become apparent",
        "it is often experienced less as a place in the earthly sense and more as a space filled with meaning, presence, or intelligence",
        "some encounter others there, though what is perceived can vary"
      ]
    },
    {
      title: "The Light / Presence",
      points: [
        "many describe an aware presence or light that knows them completely",
        "it is often felt as loving, intelligent, and impossible to hide from",
        "communication is usually immediate and non-verbal, understood all at once rather than spoken"
      ]
    },
    {
      title: "Life Review",
      points: [
        "what has been lived may become visible all at once",
        "this is not memory alone",
        "the effects of your actions on others may be felt directly, making clear that what you do affects what comes next, not just for you, but for others"
      ]
    },
    {
      title: "Boundary / Decision Point",
      points: [
        "a boundary may appear",
        "it can feel like a line, a gate, or a point beyond which continuation would mean something irreversible",
        "this is often experienced as a true threshold"
      ]
    },
    {
      title: "Return",
      points: [
        "many do not want to come back to their body",
        "the return is often felt as necessary rather than chosen",
        "what has been seen is not always meant to end the experience, but in some cases to interrupt it"
      ]
    },
    {
      title: "Re-entry into the Body",
      points: [
        "re-entry is often abrupt",
        "limitation returns immediately",
        "weight, location, and pressure are felt again as awareness re-enters form"
      ]
    },
    {
      title: "After-effects",
      points: [
        "the experience may continue, but not in the same way",
        "fear of death often decreases, meaning becomes stronger, and ordinary life can feel altered",
        "in some cases, this is the very interruption that begins remembering"
      ]
    }
  ];

  function openConsent() {
    consentBackdrop.hidden = false;
    consentBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("earth-consent-open");
  }

  function openEarthAi() {
    earthAiBackdrop.hidden = false;
    earthAiBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("earth-consent-open");
    window.setTimeout(function () {
      if (earthAiInput) earthAiInput.focus();
    }, 120);
  }

  function closeEarthAi() {
    earthAiBackdrop.hidden = true;
    earthAiBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("earth-consent-open");
  }

  function earthConfirm(options) {
    return new Promise(function (resolve) {
      const overlay = document.createElement("div");
      overlay.className = "qapp-modal-overlay";
      overlay.setAttribute("role", "presentation");

      const modal = document.createElement("div");
      modal.className = "qapp-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "earth-confirm-title");

      const header = document.createElement("div");
      header.className = "qapp-modal-header";

      const title = document.createElement("h2");
      title.id = "earth-confirm-title";
      title.textContent = options.title || "Confirm";

      const message = document.createElement("p");
      message.textContent = options.message || "Are you sure?";

      const actions = document.createElement("div");
      actions.className = "qapp-modal-actions";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "qapp-modal-cancel";
      cancelButton.textContent = options.cancelLabel || "Cancel";

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "qapp-modal-confirm" + (options.danger ? " is-danger" : "");
      confirmButton.textContent = options.confirmLabel || "OK";

      function finish(value) {
        document.removeEventListener("keydown", onKeydown);
        overlay.remove();
        resolve(value);
      }

      function onKeydown(event) {
        if (event.key === "Escape") finish(false);
      }

      header.append(title, message);
      actions.append(cancelButton, confirmButton);
      modal.append(header, actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      cancelButton.addEventListener("click", function () {
        finish(false);
      });

      confirmButton.addEventListener("click", function () {
        finish(true);
      });

      overlay.addEventListener("click", function (event) {
        if (event.target === overlay) finish(false);
      });

      document.addEventListener("keydown", onKeydown);
      cancelButton.focus();
    });
  }

  function loadEarthAiMessages() {
    try {
      const raw = localStorage.getItem(earthAiStorageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  function saveEarthAiMessages(messages) {
    localStorage.setItem(earthAiStorageKey, JSON.stringify(messages));
  }

  function renderEarthAi(messages) {
    if (!earthAiLog) return;
    earthAiLog.innerHTML = "";

    messages.forEach(function (message) {
      const bubble = document.createElement("div");
      bubble.className = "earth-ai-bubble earth-ai-bubble--" + message.role;
      const text = document.createElement("p");
      text.className = "earth-ai-bubble-text";
      text.textContent = message.text;
      bubble.appendChild(text);
      earthAiLog.appendChild(bubble);
    });

    earthAiLog.scrollTop = earthAiLog.scrollHeight;
  }

  function buildEarthSchoolContext() {
    const heroText = [
      document.querySelector("#earth-school-title")?.textContent || "",
      document.querySelector(".earth-subtitle")?.textContent || "",
      document.querySelector(".earth-intro")?.textContent || "",
    ].filter(Boolean).join("\n");

    const sectionText = sections.map(function (section) {
      const title = section.querySelector("h2")?.textContent || "";
      const subtitle = section.querySelector(".earth-panel-subtitle")?.textContent || "";
      const body = Array.from(section.querySelectorAll("p"))
        .map(function (paragraph) {
          return paragraph.textContent.trim();
        })
        .filter(Boolean)
        .join("\n");
      return [title, subtitle, body].filter(Boolean).join("\n");
    }).join("\n\n");

    const sequenceText = experienceStages.map(function (stage, index) {
      return [
        "Stage " + (index + 1) + ": " + stage.title,
        stage.points.join("\n"),
      ].join("\n");
    }).join("\n\n");

    return [
      heroText,
      "Earth School Main Guide",
      sectionText,
      "Earth School Completion Sequence",
      sequenceText,
    ].filter(Boolean).join("\n\n");
  }

  async function sendEarthAiMessage(payloadMessages, context) {
    const response = await fetch("/api/earth-school-ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payloadMessages, context: context }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Request failed");
    }

    const data = await response.json();
    return data.reply || "I couldn't generate a response.";
  }

  function closeExperienceModal() {
    experienceBackdrop.hidden = true;
    experienceBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("earth-consent-open");
  }

  function renderExperienceStage() {
    const stage = experienceStages[experienceIndex];
    experienceStepLabel.textContent = "Stage " + (experienceIndex + 1) + " of " + experienceStages.length;
    experienceTitle.textContent = stage.title;
    experienceBody.innerHTML = stage.points
      .map(function (point) {
        return "<p>" + point + "</p>";
      })
      .join("");

    const isLastStage = experienceIndex === experienceStages.length - 1;
    experienceDecision.hidden = !isLastStage;
    experiencePrevButton.disabled = experienceIndex === 0;
    experienceNextButton.hidden = isLastStage;
  }

  function openExperienceModal() {
    experienceIndex = 0;
    experienceSequence.hidden = false;
    renderExperienceStage();
    experienceBackdrop.hidden = false;
    experienceBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("earth-consent-open");
  }

  function resetToOpeningState() {
    experienceIndex = 0;
    currentIndex = 0;

    consentBackdrop.hidden = true;
    consentBackdrop.setAttribute("aria-hidden", "true");
    experienceBackdrop.hidden = true;
    experienceBackdrop.setAttribute("aria-hidden", "true");

    guideRoot.hidden = true;
    guideRoot.setAttribute("aria-hidden", "true");

    if (earthEntryCopy) earthEntryCopy.hidden = false;
    if (earthEntryActions) earthEntryActions.hidden = false;

    setActiveSection(0);
    document.body.classList.remove("earth-consent-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function revealGuide() {
    consentBackdrop.hidden = true;
    consentBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("earth-consent-open");
    if (earthEntryCopy) earthEntryCopy.hidden = true;
    if (earthEntryActions) earthEntryActions.hidden = true;
    guideRoot.hidden = false;
    guideRoot.setAttribute("aria-hidden", "false");

    window.requestAnimationFrame(function () {
      setActiveSection(0, { scroll: true });
    });
  }

  function setActiveSection(index, options) {
    const safeIndex = Math.max(0, Math.min(index, sections.length - 1));
    currentIndex = safeIndex;

    sections.forEach((section, sectionIndex) => {
      const isActive = sectionIndex === safeIndex;
      section.hidden = !isActive;
      section.classList.toggle("is-active", isActive);
    });

    chapterLinks.forEach((link, linkIndex) => {
      link.classList.toggle("is-active", linkIndex === safeIndex);
    });

    const progress = ((safeIndex + 1) / sections.length) * 100;
    progressFill.style.width = progress + "%";
    progressText.textContent = "Passage " + passageNumerals[safeIndex] + " of VI";

    prevButton.disabled = safeIndex === 0;
    nextButton.disabled = false;
    nextButton.textContent = safeIndex === sections.length - 1 ? "Complete Experience" : "Continue";

    if (options && options.scroll) {
      guideRoot.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  chapterLinks.forEach((link, index) => {
    link.addEventListener("click", function () {
      setActiveSection(index, { scroll: true });
    });
  });

  prevButton.addEventListener("click", function () {
    setActiveSection(currentIndex - 1, { scroll: true });
  });

  nextButton.addEventListener("click", function () {
    if (currentIndex < sections.length - 1) {
      setActiveSection(currentIndex + 1, { scroll: true });
      return;
    }

    openExperienceModal();
  });

  openConsentButton.addEventListener("click", function () {
    openConsent();
  });

  earthAiOpen.addEventListener("click", function () {
    openEarthAi();
  });

  earthAiClose.addEventListener("click", function () {
    closeEarthAi();
  });

  acceptConsentButton.addEventListener("click", function () {
    revealGuide();
  });

  experiencePrevButton.addEventListener("click", function () {
    if (experienceIndex > 0) {
      experienceIndex -= 1;
      renderExperienceStage();
    }
  });

  experienceNextButton.addEventListener("click", function () {
    if (experienceIndex < experienceStages.length - 1) {
      experienceIndex += 1;
      renderExperienceStage();
    }
  });

  enterBodyButton.addEventListener("click", function () {
    closeExperienceModal();
    setActiveSection(3, { scroll: true });
  });

  completeExperienceButton.addEventListener("click", function () {
    closeExperienceModal();
    resetToOpeningState();
  });

  if (earthAiLog && earthAiForm && earthAiInput && earthAiClear) {
    const earthAiMessages = loadEarthAiMessages();
    renderEarthAi(earthAiMessages);

    earthAiForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const text = earthAiInput.value.trim();
      if (!text) return;

      earthAiMessages.push({ role: "user", text: text });
      const payloadMessages = earthAiMessages.map(function (message) {
        return { role: message.role, content: message.text };
      });
      const pendingIndex = earthAiMessages.push({ role: "assistant", text: "Thinking..." }) - 1;

      renderEarthAi(earthAiMessages);
      saveEarthAiMessages(earthAiMessages);
      earthAiInput.value = "";

      try {
        const reply = await sendEarthAiMessage(payloadMessages, buildEarthSchoolContext());
        earthAiMessages[pendingIndex].text = reply;
      } catch (error) {
        earthAiMessages[pendingIndex].text = "Sorry, something went wrong. Please try again.";
      }

      renderEarthAi(earthAiMessages);
      saveEarthAiMessages(earthAiMessages);
    });

    earthAiClear.addEventListener("click", async function () {
      const confirmed = await earthConfirm({
        title: "Clear Chat",
        message: "Clear this Earth School chat from your device?",
        confirmLabel: "Clear",
        danger: true,
      });
      if (!confirmed) return;
      earthAiMessages.length = 0;
      saveEarthAiMessages(earthAiMessages);
      renderEarthAi(earthAiMessages);
    });
  }

  guideRoot.setAttribute("aria-hidden", "true");
  setActiveSection(0);
})();
