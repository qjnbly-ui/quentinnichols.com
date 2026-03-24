(() => {
  const siteNav = document.querySelector(".site-nav");
  const nav = document.querySelector(".nav-menu");
  if (!siteNav || !nav) return;

  const summary = nav.querySelector("summary");
  const panel = nav.querySelector(".nav-menu-panel");
  const spacer = siteNav.querySelector(".nav-spacer");
  if (!summary || !panel || !spacer) return;

  if (!summary.querySelector(".nav-menu-label")) {
    summary.innerHTML = '<span class="nav-menu-label">Menu</span>';
  }

  let actionLink = spacer.querySelector(".nav-action-link");
  if (!actionLink) {
    actionLink = document.createElement("a");
    actionLink.className = "nav-action-link";
    spacer.removeAttribute("aria-hidden");
    spacer.appendChild(actionLink);
  }

  const inPortal = window.location.pathname.startsWith("/portal/");
  const inLogin = window.location.pathname.startsWith("/login/");
  actionLink.textContent = inPortal ? "Portal" : "Login";
  actionLink.href = inPortal ? "/portal/" : "/login/";

  let closeButton = panel.querySelector(".nav-menu-close");
  if (!closeButton) {
    closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "nav-menu-close";
    closeButton.textContent = "Close";
    panel.prepend(closeButton);
  }

  let backdrop = siteNav.querySelector(".nav-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "nav-backdrop";
    backdrop.setAttribute("aria-label", "Close menu");
    siteNav.appendChild(backdrop);
  }

  const sync = () => {
    const open = nav.hasAttribute("open");
    siteNav.classList.toggle("nav-open", open);
    document.body.classList.toggle("nav-menu-open", open);
    summary.setAttribute("aria-expanded", open ? "true" : "false");
  };

  closeButton.addEventListener("click", () => {
    nav.removeAttribute("open");
    sync();
  });

  backdrop.addEventListener("click", () => {
    nav.removeAttribute("open");
    sync();
  });

  nav.addEventListener("toggle", sync);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.hasAttribute("open")) {
      nav.removeAttribute("open");
      sync();
    }
  });

  sync();
})();
