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
  const experiencePrevButton = document.querySelector("[data-experience-prev]");
  const experienceNextButton = document.querySelector("[data-experience-next]");
  const enterBodyButton = document.querySelector("[data-choice-enter-body]");
  const completeExperienceButton = document.querySelector("[data-choice-complete]");
  const prevButton = document.querySelector("[data-prev-section]");
  const nextButton = document.querySelector("[data-next-section]");
  const progressFill = document.querySelector("[data-progress-fill]");
  const progressText = document.querySelector("[data-progress-text]");
  const guideRoot = document.querySelector("[data-guide-root]");

  if (!sections.length || !chapterLinks.length || !prevButton || !nextButton || !progressFill || !progressText || !guideRoot || !openConsentButton || !acceptConsentButton || !consentBackdrop || !experienceBackdrop || !experienceStepLabel || !experienceTitle || !experienceBody || !experienceDecision || !experiencePrevButton || !experienceNextButton || !enterBodyButton || !completeExperienceButton) {
    return;
  }

  let currentIndex = 0;
  let experienceIndex = 0;
  const passageNumerals = ["I", "II", "III", "IV", "V", "VI"];
  const experienceStages = [
    {
      title: "Separation",
      points: [
        "awareness continues while the body is inactive",
        "often described as leaving the body or observing from above",
        "sometimes confusion appears at first"
      ]
    },
    {
      title: "Peace / Release",
      points: [
        "pain disappears",
        "overwhelming calm, safety, or relief arrives",
        "often described as more real than normal life"
      ]
    },
    {
      title: "Transition / Movement",
      points: [
        "there is movement without effort",
        "commonly described as tunnel, darkness, or light",
        "direction is felt before it is understood"
      ]
    },
    {
      title: "Encounter / Environment",
      points: [
        "a different space or realm is entered",
        "it may be felt as light, presence, or meaningful environment",
        "some describe relatives or beings, though this varies"
      ]
    },
    {
      title: "The Light / Presence",
      points: [
        "it is often described as intelligent, loving, and fully aware of you",
        "communication is immediate",
        "it is usually non-verbal"
      ]
    },
    {
      title: "Life Review",
      points: [
        "life is seen all at once rather than piece by piece",
        "it is not only memory",
        "the effects of actions on others are felt directly"
      ]
    },
    {
      title: "Boundary / Decision Point",
      points: [
        "a threshold appears",
        "it may feel like a line, gate, or point of no return",
        "the sense is clear: further movement changes everything"
      ]
    },
    {
      title: "Return",
      points: [
        "many do not want to come back to their body",
        "the return can feel assigned rather than chosen",
        "the message is often that it is not yet time"
      ]
    },
    {
      title: "Re-entry into the Body",
      points: [
        "re-entry is abrupt",
        "limitation returns immediately",
        "the body can feel painful or dense again"
      ]
    },
    {
      title: "After-effects",
      points: [
        "perspective on life changes",
        "fear of death often decreases",
        "meaning becomes stronger and the experience can be difficult to explain"
      ]
    }
  ];

  function openConsent() {
    consentBackdrop.hidden = false;
    consentBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("earth-consent-open");
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
    renderExperienceStage();
    experienceBackdrop.hidden = false;
    experienceBackdrop.setAttribute("aria-hidden", "false");
    document.body.classList.add("earth-consent-open");
  }

  function resetToOpeningState() {
    guideRoot.hidden = true;
    guideRoot.setAttribute("aria-hidden", "true");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function revealGuide() {
    consentBackdrop.hidden = true;
    consentBackdrop.setAttribute("aria-hidden", "true");
    document.body.classList.remove("earth-consent-open");
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
      const activeSection = sections[safeIndex];
      if (activeSection) {
        activeSection.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
    setActiveSection(4, { scroll: true });
  });

  completeExperienceButton.addEventListener("click", function () {
    closeExperienceModal();
    resetToOpeningState();
  });

  guideRoot.setAttribute("aria-hidden", "true");
  setActiveSection(0);
})();
