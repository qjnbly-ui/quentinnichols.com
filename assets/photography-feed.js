(() => {
  const grid = document.querySelector(".qjn-blend-grid");
  if (!grid) return;

  const SLOT_CLASSES = [
    "qjn-blend-photo--hero",
    "qjn-blend-photo--tall",
    "qjn-blend-photo--wide",
    "qjn-blend-photo--small",
    "qjn-blend-photo--small",
    "qjn-blend-photo--wide",
    "qjn-blend-photo--tall",
    "qjn-blend-photo--small",
    "qjn-blend-photo--small",
    "qjn-blend-photo--wide",
    "qjn-blend-photo--small",
    "qjn-blend-photo--tall",
  ];

  function toAltText(item) {
    const category = item?.category === "portraits" ? "Portrait" : "Landscape";
    const base = String(item?.name || "")
      .replace(/\.[^/.]+$/, "")
      .replace(/[-_.]+/g, " ")
      .trim();
    return base ? `${category}: ${base}` : `${category} photo`;
  }

  function render(images) {
    const selected = images.slice(0, SLOT_CLASSES.length);
    grid.innerHTML = "";

    selected.forEach((image, index) => {
      const figure = document.createElement("figure");
      figure.className = `qjn-blend-photo ${SLOT_CLASSES[index] || "qjn-blend-photo--small"}`;

      const img = document.createElement("img");
      img.src = image.url;
      img.alt = toAltText(image);
      img.loading = "lazy";
      img.decoding = "async";

      figure.appendChild(img);
      grid.appendChild(figure);
    });
  }

  async function init() {
    try {
      const response = await fetch("/api/photography-feed", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) return;

      const payload = await response.json();
      const images = Array.isArray(payload?.images) ? payload.images : [];
      if (images.length === 0) return;
      render(images);
    } catch (_error) {
      // Keep server-rendered fallback if fetch fails.
    }
  }

  init();
})();
