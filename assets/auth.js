(() => {
  const SESSION_HINT_KEY = "site_auth_hint";
  const listeners = new Set();

  async function parseJson(response) {
    try {
      return await response.json();
    } catch (_error) {
      return {};
    }
  }

  function notify(session) {
    listeners.forEach((callback) => {
      try {
        callback(session || null);
      } catch (_error) {
        // Listener errors should not break auth flow.
      }
    });
  }

  function setSessionHint(isLoggedIn) {
    try {
      if (isLoggedIn) {
        window.localStorage.setItem(SESSION_HINT_KEY, "1");
      } else {
        window.localStorage.removeItem(SESSION_HINT_KEY);
      }
    } catch (_error) {
      // Ignore storage errors in private browsing/restricted contexts.
    }
  }

  async function getSession() {
    const response = await fetch("/api/auth-session", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (response.ok) {
      const payload = await parseJson(response);
      const session = payload?.session || null;
      setSessionHint(Boolean(session));
      return session;
    }

    if (response.status === 401) {
      setSessionHint(false);
      return null;
    }

    const payload = await parseJson(response);
    throw new Error(payload?.error || "Unable to fetch session.");
  }

  async function login(email, password, captchaToken = "") {
    const response = await fetch("/api/auth-login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password, captchaToken }),
    });

    const payload = await parseJson(response);
    if (!response.ok) {
      return {
        data: null,
        error: { message: payload?.error || "Login failed." },
      };
    }

    const session = await getSession().catch(() => null);
    notify(session);
    return { data: payload, error: null };
  }

  async function logout() {
    await fetch("/api/auth-logout", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    setSessionHint(false);
    notify(null);
    return { error: null };
  }

  async function onAuthStateChange(callback) {
    listeners.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe() {
            listeners.delete(callback);
          },
        },
      },
    };
  }

  function getStoredSession() {
    try {
      return window.localStorage.getItem(SESSION_HINT_KEY) ? { hinted: true } : null;
    } catch (_error) {
      return null;
    }
  }

  function hasStoredSession() {
    return Boolean(getStoredSession());
  }

  window.siteAuth = {
    getSession,
    getStoredSession,
    hasStoredSession,
    login,
    logout,
    onAuthStateChange,
  };
})();
