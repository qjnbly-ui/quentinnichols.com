(() => {
  const hero = document.querySelector(".home-page .qjn-hero-simple");
  if (!hero) return;

  const heroText = hero.querySelector(".qjn-hero-text");
  const nav = document.querySelector(".site-nav");
  if (!heroText || !nav) return;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const ease = (value) => value * value * (3 - 2 * value);
  const readNumber = (style, property, fallback) => {
    const value = parseFloat(style.getPropertyValue(property));
    return Number.isFinite(value) ? value : fallback;
  };

  let finishScroll = 1;
  let startBrightness = 0.78;
  let endBrightness = 1.08;
  let endOverlayOpacity = 0.42;
  let ticking = false;

  const measure = () => {
    const style = window.getComputedStyle(hero);
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const navHeight = nav.getBoundingClientRect().height || 72;
    const textTop = heroText.getBoundingClientRect().top + scrollY;

    startBrightness = readNumber(style, "--hero-image-start-brightness", 0.78);
    endBrightness = readNumber(style, "--hero-image-end-brightness", 1.08);
    endOverlayOpacity = readNumber(style, "--hero-overlay-end-opacity", 0.42);
    finishScroll = Math.max(36, (textTop - navHeight - 24) * 0.58);
  };

  const render = () => {
    ticking = false;

    const progress = clamp((window.scrollY || window.pageYOffset || 0) / finishScroll, 0, 1);
    const easedProgress = ease(progress);
    const navControlsProgress = clamp((easedProgress - 0.06) / 0.5, 0, 1);
    const brightness = startBrightness + (endBrightness - startBrightness) * easedProgress;
    const overlayOpacity = 1 - (1 - endOverlayOpacity) * easedProgress;

    hero.style.setProperty("--hero-text-opacity", (1 - easedProgress).toFixed(3));
    hero.style.setProperty("--hero-image-brightness", brightness.toFixed(3));
    hero.style.setProperty("--hero-overlay-opacity", overlayOpacity.toFixed(3));
    nav.style.setProperty("--home-nav-controls-opacity", navControlsProgress.toFixed(3));
    nav.classList.toggle("home-controls-active", navControlsProgress > 0.01);
    heroText.style.pointerEvents = easedProgress > 0.98 ? "none" : "";
  };

  const requestRender = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(render);
  };

  const refresh = () => {
    measure();
    requestRender();
  };

  refresh();
  window.addEventListener("scroll", requestRender, { passive: true });
  window.addEventListener("resize", refresh);
  window.addEventListener("orientationchange", refresh);
})();
