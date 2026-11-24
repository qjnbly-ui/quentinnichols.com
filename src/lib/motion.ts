/**
 * All site motion in one place. Scroll and pointer work is batched into one
 * animation frame, only runs for sections on screen, and stops entirely when
 * the visitor prefers reduced motion. Nothing intercepts scrolling.
 */
const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function initMotion() {
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const wide = matchMedia("(min-width: 861px)");
  (window as unknown as { __motion: boolean }).__motion = true;

  // Reveal on scroll.
  const revealTargets = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
  const revealer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in-view");
        revealer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  revealTargets.forEach((target) => revealer.observe(target));

  const header = document.querySelector<HTMLElement>(".site-header");
  const opening = document.querySelector<HTMLElement>("[data-opening]");
  const chapter = document.querySelector<HTMLElement>("[data-chapter]");
  const statements = chapter ? [...chapter.querySelectorAll<HTMLElement>(".statement")] : [];
  const rail = chapter ? [...chapter.querySelectorAll<HTMLElement>(".chapter-rail li")] : [];
  const timeline = document.querySelector<HTMLElement>("[data-timeline]");
  const milestones = timeline ? [...timeline.querySelectorAll<HTMLElement>(".about-item")] : [];
  let timelineVisible = false;

  let frame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let openingVisible = !!opening;
  let chapterVisible = false;
  let step = -1;

  const sceneMode = () => !!chapter && wide.matches && !reduced.matches;

  const setStep = (next: number) => {
    if (next === step) return;
    step = next;
    statements.forEach((item, index) => {
      item.classList.toggle("is-active", index === next);
      item.classList.toggle("is-done", index < next);
    });
    rail.forEach((item, index) => {
      item.classList.toggle("is-active", index === next);
      item.classList.toggle("is-done", index < next);
    });
  };

  const render = () => {
    frame = 0;
    const range = root.scrollHeight - innerHeight;
    root.style.setProperty("--page-progress", String(range > 0 ? scrollY / range : 0));
    if (header && opening) header.classList.toggle("is-solid", scrollY > innerHeight * 0.55);

    if (reduced.matches) return;
    if (timeline && timelineVisible) {
      // The line fills to the middle of the screen; each dot lights once its entry reaches it.
      const focus = innerHeight * 0.6;
      const rect = timeline.getBoundingClientRect();
      timeline.style.setProperty("--timeline-progress", clamp((focus - rect.top) / rect.height).toFixed(4));
      // One entry at a time: the one nearest the middle of the screen is in focus; the rest dim.
      const middle = innerHeight / 2;
      let current: HTMLElement | null = null;
      let nearest = Infinity;
      for (const item of milestones) {
        const box = item.getBoundingClientRect();
        item.classList.toggle("is-lit", box.top + 30 < focus);
        const distance = box.top <= middle && box.bottom >= middle ? 0 : Math.min(Math.abs(box.top - middle), Math.abs(box.bottom - middle));
        if (distance < nearest) {
          nearest = distance;
          current = item;
        }
      }
      for (const item of milestones) item.classList.toggle("is-current", item === current);
    }
    if (opening && openingVisible) {
      const rect = opening.getBoundingClientRect();
      opening.style.setProperty("--opening-scroll", String(clamp(-rect.top / rect.height)));
      opening.style.setProperty("--pointer-x", pointerX.toFixed(3));
      opening.style.setProperty("--pointer-y", pointerY.toFixed(3));
    }
    if (chapter && chapterVisible && sceneMode()) {
      const rect = chapter.getBoundingClientRect();
      const progress = clamp(-rect.top / Math.max(1, rect.height - innerHeight));
      chapter.style.setProperty("--scene-progress", progress.toFixed(3));
      setStep(Math.min(statements.length - 1, Math.floor(progress * statements.length * 0.999)));
    }
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const visibility = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target === opening) openingVisible = entry.isIntersecting;
      if (entry.target === chapter) chapterVisible = entry.isIntersecting;
      if (entry.target === timeline) timelineVisible = entry.isIntersecting;
    }
    request();
  });
  if (opening) visibility.observe(opening);
  if (chapter) visibility.observe(chapter);
  if (timeline) visibility.observe(timeline);

  opening?.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || reduced.matches) return;
    const rect = opening.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width - 0.5;
    pointerY = (event.clientY - rect.top) / rect.height - 0.5;
    request();
  });
  opening?.addEventListener("pointerleave", () => {
    pointerX = pointerY = 0;
    request();
  });

  // Cards light up where the pointer is.
  document.querySelectorAll<HTMLElement>(".spotlight").forEach((card) =>
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    }),
  );

  const syncMode = () => {
    const on = sceneMode();
    root.classList.toggle("scene-on", on);
    if (!on && chapter) {
      chapter.style.removeProperty("--scene-progress");
      step = -1;
      statements.concat(rail).forEach((item) => item.classList.remove("is-active", "is-done"));
    }
    if (reduced.matches) {
      revealTargets.forEach((target) => target.classList.add("in-view"));
      // A still page: the whole line drawn and every dot lit.
      timeline?.style.removeProperty("--timeline-progress");
      milestones.forEach((item) => {
        item.classList.add("is-lit");
        item.classList.remove("is-current");
      });
      opening?.style.removeProperty("--opening-scroll");
      opening?.style.removeProperty("--pointer-x");
      opening?.style.removeProperty("--pointer-y");
    } else if (timeline && !timeline.style.getPropertyValue("--timeline-progress")) {
      timeline.style.setProperty("--timeline-progress", "0"); // start empty; the first frame fills it in
    }
    request();
  };

  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", request, { passive: true });
  reduced.addEventListener("change", syncMode);
  wide.addEventListener("change", syncMode);
  syncMode();
}
