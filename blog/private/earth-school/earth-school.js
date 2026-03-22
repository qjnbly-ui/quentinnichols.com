(function () {
  const sections = Array.from(document.querySelectorAll("[data-section]"));
  const chapterLinks = Array.from(document.querySelectorAll(".earth-chapter-link"));
  const startButton = document.querySelector("[data-start-guide]");
  const prevButton = document.querySelector("[data-prev-section]");
  const nextButton = document.querySelector("[data-next-section]");
  const progressFill = document.querySelector("[data-progress-fill]");
  const progressText = document.querySelector("[data-progress-text]");
  const guideRoot = document.querySelector("[data-guide-root]");

  if (!sections.length || !chapterLinks.length || !prevButton || !nextButton || !progressFill || !progressText || !guideRoot) {
    return;
  }

  let currentIndex = 0;

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
    progressText.textContent = "Section " + (safeIndex + 1) + " of " + sections.length;

    prevButton.disabled = safeIndex === 0;
    nextButton.disabled = false;
    nextButton.textContent = safeIndex === sections.length - 1 ? "Return to Beginning" : "Next Section";

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

    setActiveSection(0, { scroll: true });
  });

  if (startButton) {
    startButton.addEventListener("click", function () {
      setActiveSection(0, { scroll: true });
    });
  }

  setActiveSection(0);
})();
