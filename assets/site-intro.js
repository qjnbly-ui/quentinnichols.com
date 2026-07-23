(() => {
  const root = document.documentElement;
  const intro = document.querySelector(".qjn-site-intro");
  if (!intro) return;

  const storageKey = "qjn-home-intro-seen-v1";
  const shouldPlay = root.classList.contains("qjn-intro-ready");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const rememberIntro = () => {
    try {
      sessionStorage.setItem(storageKey, "true");
    } catch (_error) {
      // The intro still finishes normally when session storage is unavailable.
    }
  };

  const finishIntro = () => {
    root.classList.remove("qjn-intro-ready", "qjn-intro-playing");
    root.classList.add("qjn-intro-complete");
    intro.remove();
  };

  if (!shouldPlay || reduceMotion) {
    rememberIntro();
    finishIntro();
    return;
  }

  root.classList.add("qjn-intro-playing");
  rememberIntro();

  intro.querySelector(".qjn-site-intro-skip")
    ?.addEventListener("click", finishIntro, { once: true });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") finishIntro();
  }, { once: true });

  intro.addEventListener("animationend", (event) => {
    if (event.target === intro && event.animationName === "qjn-intro-exit") {
      finishIntro();
    }
  });

  window.setTimeout(finishIntro, 4300);
})();
