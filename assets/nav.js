(() => {
  const siteNav = document.querySelector(".site-nav");
  const nav = document.querySelector(".nav-menu");
  if (!siteNav || !nav) return;

  const summary = nav.querySelector("summary");
  const panel = nav.querySelector(".nav-menu-panel");
  const spacer = siteNav.querySelector(".nav-spacer");
  if (!summary || !panel || !spacer) return;

  const blogLink = panel.querySelector('a[href="/blog/"]');
  if (blogLink) {
    blogLink.remove();
  }

  if (!summary.querySelector(".nav-menu-label")) {
    const label = document.createElement("span");
    label.className = "nav-menu-label";
    label.textContent = "Menu";
    summary.appendChild(label);
  }

  let actionLink = spacer.querySelector(".nav-action-link");
  if (!actionLink) {
    actionLink = document.createElement("a");
    actionLink.className = "nav-action-link";
    spacer.removeAttribute("aria-hidden");
    spacer.appendChild(actionLink);
  }

  const inPortal = window.location.pathname.startsWith("/portal/");
  const setActionLink = (session) => {
    const loggedIn = Boolean(session);
    actionLink.textContent = loggedIn || inPortal ? "Portal" : "Login";
    actionLink.href = loggedIn || inPortal ? "/portal/" : "/login/";
    actionLink.setAttribute("aria-label", loggedIn || inPortal ? "Go to portal" : "Go to login");
  };

  const getStoredSessionHint = () => {
    if (window.siteAuth?.getStoredSession) {
      return window.siteAuth.getStoredSession();
    }

    try {
      const raw = window.localStorage.getItem("sb-mgxdiolwevcgwgzhzttd-auth-token");
      return raw ? JSON.parse(raw) : null;
    } catch (_error) {
      return null;
    }
  };

  setActionLink(getStoredSessionHint());

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

  const loadAuth = () =>
    new Promise((resolve, reject) => {
      if (window.siteAuth) {
        resolve(window.siteAuth);
        return;
      }

      const existingScript = document.querySelector('script[src="/assets/auth.js"]');
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.siteAuth), { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "/assets/auth.js";
      script.async = true;
      script.onload = () => resolve(window.siteAuth);
      script.onerror = reject;
      document.head.appendChild(script);
    });

  loadAuth()
    .then(async (auth) => {
      if (!auth) return;
      setActionLink(await auth.getSession());
      await auth.onAuthStateChange((session) => {
        setActionLink(session);
      });
    })
    .catch(() => {
      setActionLink(null);
    });
})();
