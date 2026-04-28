(() => {
  const TURNSTILE_SITE_KEY = "0x4AAAAAADFJc_rxYfcRB4-e";

  const loginForm = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("login-button");
  const message = document.getElementById("message");
  const turnstileContainer = document.getElementById("auth-turnstile");
  const nextParam = new URLSearchParams(window.location.search).get("next");

  if (
    !loginForm ||
    !emailInput ||
    !passwordInput ||
    !loginButton ||
    !message ||
    !window.siteAuth
  ) {
    return;
  }

  let captchaToken = "";
  let captchaWidgetId = null;

  function getPostLoginDestination() {
    if (typeof nextParam === "string" && nextParam.startsWith("/")) {
      return nextParam;
    }
    return "/portal/";
  }

  function setMessage(text, state = "") {
    message.innerText = text;
    if (state) {
      message.dataset.state = state;
    } else {
      delete message.dataset.state;
    }
  }

  function setPending(pending) {
    emailInput.disabled = pending;
    passwordInput.disabled = pending;
    loginButton.disabled = pending;
    loginButton.textContent = pending ? "Signing In..." : "Login";
  }

  function resetCaptcha() {
    captchaToken = "";
    if (!window.turnstile || captchaWidgetId === null) return;
    window.turnstile.reset(captchaWidgetId);
  }

  async function waitForTurnstile(maxWaitMs = 5000) {
    const startedAt = Date.now();
    while (!window.turnstile) {
      if (Date.now() - startedAt > maxWaitMs) return false;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return true;
  }

  async function initCaptcha() {
    if (!TURNSTILE_SITE_KEY || !turnstileContainer) return;
    const ready = await waitForTurnstile();
    if (!ready) {
      setMessage("Security check failed to load. Refresh and try again.", "error");
      return;
    }

    captchaWidgetId = window.turnstile.render(turnstileContainer, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => {
        captchaToken = token;
      },
      "expired-callback": () => {
        captchaToken = "";
      },
      "error-callback": () => {
        captchaToken = "";
      },
    });
  }

  async function login() {
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!captchaToken && window.turnstile && captchaWidgetId !== null) {
      captchaToken = String(window.turnstile.getResponse(captchaWidgetId) || "").trim();
    }

    if (!email || !password) {
      setMessage("Enter your email and password to continue.", "error");
      return;
    }

    if (!captchaToken) {
      setMessage("Complete the security check first.", "error");
      return;
    }

    setMessage("");
    setPending(true);

    try {
      const { error } = await window.siteAuth.login(email, password, captchaToken);

      if (error) {
        resetCaptcha();
        setMessage(error.message, "error");
        return;
      }

      setMessage("Login successful. Redirecting...", "success");
      window.location.href = getPostLoginDestination();
    } catch (_error) {
      resetCaptcha();
      setMessage("Login failed. Please try again.", "error");
    } finally {
      setPending(false);
    }
  }

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    login();
  });

  const hintedSession = window.siteAuth.getStoredSession?.();
  if (hintedSession) {
    window.siteAuth.getSession().then((session) => {
      if (session) {
        window.location.href = getPostLoginDestination();
      }
    });
  }

  initCaptcha();
})();
