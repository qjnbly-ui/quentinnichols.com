import { createBrowserSupabase, hasConfig, getSessionOrNull } from "./lib/supabase-client.js";

const setupPanel = document.getElementById("setup-panel");
const authPanel = document.getElementById("auth-panel");
const authStatus = document.getElementById("auth-status");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const signupForm = document.getElementById("signup-form");
const signinForm = document.getElementById("signin-form");
const showSigninButton = document.getElementById("show-signin-button");
const showSignupButton = document.getElementById("show-signup-button");

let supabase = null;

function setStatus(message, tone = "") {
  authStatus.textContent = message || "";
  authStatus.className = "status";
  if (tone) authStatus.classList.add(tone);
}

function show(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function toggleSignup(visible) {
  show(signupForm, visible);
  show(signinForm, !visible);
  showSignupButton.classList.toggle("is-active", visible);
  showSigninButton.classList.toggle("is-active", !visible);
  showSignupButton.setAttribute("aria-pressed", String(visible));
  showSigninButton.setAttribute("aria-pressed", String(!visible));
  authTitle.textContent = visible ? "Create account" : "Sign in";
  authSubtitle.textContent = visible
    ? "Create your account to start building your records library."
    : "Use the account tied to your records library.";
  setStatus("");
}

async function redirectIfAuthed() {
  const session = await getSessionOrNull(supabase);
  if (session?.user) {
    window.location.replace("./dashboard.html");
    return true;
  }
  return false;
}

async function handleSignup(event) {
  event.preventDefault();
  const fullName = document.getElementById("signup-full-name").value.trim();
  const organizationName = document.getElementById("signup-organization").value.trim();
  const role = document.getElementById("signup-role").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;

  setStatus("Creating account...");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        organization_name: organizationName,
        role,
      },
    },
  });

  if (error) {
    setStatus(error.message, "error");
    return;
  }

  if (data?.user && data?.session) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        email,
        full_name: fullName,
        organization_name: organizationName,
        role,
        subscription_tier: "free",
        account_status: "active",
        document_limit: 25,
      })
      .eq("id", data.user.id);

    if (profileError) {
      setStatus(`Account created, but profile save failed: ${profileError.message}`, "error");
      return;
    }
  }

  setStatus("Account created. Check your email if confirmation is enabled, then sign in.", "success");
}

async function handleSignin(event) {
  event.preventDefault();
  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;

  setStatus("Signing in...");
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus(error.message, "error");
    return;
  }

  window.location.replace("./dashboard.html");
}

async function init() {
  show(setupPanel, !hasConfig());
  show(authPanel, hasConfig());
  if (!hasConfig()) return;

  supabase = createBrowserSupabase();
  toggleSignup(false);

  if (await redirectIfAuthed()) return;

  signupForm.addEventListener("submit", handleSignup);
  signinForm.addEventListener("submit", handleSignin);
  showSigninButton.addEventListener("click", () => toggleSignup(false));
  showSignupButton.addEventListener("click", () => toggleSignup(true));

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      window.location.replace("./dashboard.html");
    }
  });
}

init();
