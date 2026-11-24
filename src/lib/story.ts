/**
 * Motion for long-form entries: large figures count up the first time they appear.
 * With reduced motion, figures simply show their final value.
 */
export function initStory() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const format = new Intl.NumberFormat("en-US");
  const counter = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        counter.unobserve(entry.target);
        const element = entry.target as HTMLElement;
        const target = Number(element.dataset.count);
        if (reduced.matches || !Number.isFinite(target)) continue;
        const start = performance.now();
        const duration = 1800;
        const tick = (time: number) => {
          const t = Math.min(1, (time - start) / duration);
          element.textContent = format.format(Math.round(target * (1 - Math.pow(1 - t, 3))));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    },
    { threshold: 0.8 },
  );
  document.querySelectorAll<HTMLElement>(".count[data-count]").forEach((element) => counter.observe(element));
}
