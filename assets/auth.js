(() => {
  const SUPABASE_URL = "https://mgxdiolwevcgwgzhzttd.supabase.co";
  const SUPABASE_PROJECT_REF = "mgxdiolwevcgwgzhzttd";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1neGRpb2x3ZXZjZ3dnemh6dHRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNDM1NzMsImV4cCI6MjA4ODgxOTU3M30.S6QuRVHIhFW1UnRYP1S38ILXWIZ7WtqHI8BqoDhUhGA";
  const SUPABASE_SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js";

  let clientPromise;

  function waitForExistingScript(script) {
    return new Promise((resolve, reject) => {
      if (window.supabase) {
        resolve(window.supabase);
        return;
      }

      script.addEventListener("load", () => resolve(window.supabase), { once: true });
      script.addEventListener("error", reject, { once: true });
    });
  }

  function loadSupabase() {
    if (window.supabase) {
      return Promise.resolve(window.supabase);
    }

    const existingScript = document.querySelector(`script[src="${SUPABASE_SCRIPT_SRC}"]`);
    if (existingScript) {
      return waitForExistingScript(existingScript);
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SUPABASE_SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(window.supabase);
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function getClient() {
    if (!clientPromise) {
      clientPromise = loadSupabase().then((supabaseLib) => {
        const { createClient } = supabaseLib;
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      });
    }

    return clientPromise;
  }

  async function getSession() {
    const client = await getClient();
    const { data, error } = await client.auth.getSession();
    if (error) {
      throw error;
    }
    return data.session || null;
  }

  async function login(email, password) {
    const client = await getClient();
    return client.auth.signInWithPassword({ email, password });
  }

  async function logout() {
    const client = await getClient();
    return client.auth.signOut();
  }

  async function onAuthStateChange(callback) {
    const client = await getClient();
    return client.auth.onAuthStateChange((_event, session) => {
      callback(session || null);
    });
  }

  function getStoredSession() {
    try {
      const storageKey = `sb-${SUPABASE_PROJECT_REF}-auth-token`;
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (parsed?.access_token) {
        return parsed;
      }

      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry?.access_token) {
            return entry;
          }
          if (entry?.currentSession?.access_token) {
            return entry.currentSession;
          }
        }
      }

      if (parsed?.currentSession?.access_token) {
        return parsed.currentSession;
      }
    } catch (_error) {
      return null;
    }

    return null;
  }

  function hasStoredSession() {
    return Boolean(getStoredSession());
  }

  window.siteAuth = {
    getClient,
    getSession,
    getStoredSession,
    hasStoredSession,
    login,
    logout,
    onAuthStateChange,
  };
})();
