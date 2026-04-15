import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";
import JSZip from "https://esm.sh/jszip@3.10.1";

const config = window.RECORDS_APP_CONFIG || {};
const setupPanel = document.getElementById("setup-panel");
const authPanel = document.getElementById("auth-panel");
const appPanel = document.getElementById("app-panel");

const authStatus = document.getElementById("auth-status");
const uploadStatus = document.getElementById("upload-status");
const docsStatus = document.getElementById("docs-status");
const userBadge = document.getElementById("user-badge");
const authTitle = document.getElementById("auth-title");
const authSubtitle = document.getElementById("auth-subtitle");
const accountName = document.getElementById("account-name");
const accountOrganization = document.getElementById("account-organization");
const accountRole = document.getElementById("account-role");
const accountTier = document.getElementById("account-tier");
const accountStatus = document.getElementById("account-status");
const accountLimit = document.getElementById("account-limit");
const accountCustomerId = document.getElementById("account-customer-id");
const accountSubscriptionId = document.getElementById("account-subscription-id");
const billingNote = document.getElementById("billing-note");

const signupForm = document.getElementById("signup-form");
const signinForm = document.getElementById("signin-form");
const showSigninButton = document.getElementById("show-signin-button");
const showSignupButton = document.getElementById("show-signup-button");
const signoutButton = document.getElementById("signout-button");
const uploadForm = document.getElementById("upload-form");
const refreshButton = document.getElementById("refresh-docs");

const searchQueryInput = document.getElementById("search-query");
const searchStatusSelect = document.getElementById("search-status");
const searchResetButton = document.getElementById("search-reset");

const uploadTitleInput = document.getElementById("upload-title");
const uploadYearInput = document.getElementById("upload-year");
const uploadMonthInput = document.getElementById("upload-month");
const uploadFileInput = document.getElementById("upload-file");

const docList = document.getElementById("doc-list");
const docEmpty = document.getElementById("doc-empty");

const statFiles = document.getElementById("stat-files");
const statReady = document.getElementById("stat-ready");
const statProcessing = document.getElementById("stat-processing");

let supabase = null;
let currentSession = null;
let documentsCache = [];
let currentProfile = null;

function setStatus(el, message, tone = "") {
  if (!el) return;
  el.textContent = message || "";
  el.className = "status";
  if (tone) el.classList.add(tone);
}

function show(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
}

function toggleSignup(visible) {
  show(signupForm, visible);
  show(signinForm, !visible);
  showSignupButton?.classList.toggle("is-active", visible);
  showSigninButton?.classList.toggle("is-active", !visible);
  showSignupButton?.setAttribute("aria-pressed", String(visible));
  showSigninButton?.setAttribute("aria-pressed", String(!visible));

  if (authTitle) {
    authTitle.textContent = visible ? "Create account" : "Sign in";
  }

  if (authSubtitle) {
    authSubtitle.textContent = visible
      ? "Create your account to start building your records library."
      : "Use the account tied to your records library.";
  }

  setStatus(authStatus, "");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cleanWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function decodeXmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

async function extractDocxText(file) {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = zip.file("word/document.xml");
  if (!xmlFile) {
    throw new Error("This DOCX file is missing word/document.xml.");
  }

  const xml = await xmlFile.async("string");
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  const text = paragraphs
    .map((paragraph) => {
      const runs = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
      return runs
        .map((run) => run.replace(/<\/?w:t[^>]*>/g, ""))
        .map((value) => decodeXmlEntities(value))
        .join(" ");
    })
    .join("\n");

  return cleanWhitespace(text);
}

async function extractTextFromFile(file) {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith(".docx")) {
    return extractDocxText(file);
  }

  if (
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json") ||
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm")
  ) {
    const text = await file.text();
    return cleanWhitespace(text);
  }

  if (lowerName.endsWith(".doc")) {
    throw new Error("Legacy .doc files are not supported in the simple browser version. Convert them to .docx first.");
  }

  if (lowerName.endsWith(".pdf")) {
    throw new Error("PDF extraction is not set up in the simple browser version yet. Start with .docx or plain-text files.");
  }

  throw new Error("Unsupported file type. Use .docx, .txt, .md, .csv, .json, or .html.");
}

function snippetFromText(text, query) {
  if (!text) return "No extracted text yet.";
  if (!query) return text.slice(0, 220).trim() + (text.length > 220 ? "..." : "");

  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const index = lower.indexOf(q);
  if (index === -1) return text.slice(0, 220).trim() + (text.length > 220 ? "..." : "");

  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + q.length + 120);
  const snippet = text.slice(start, end).trim();
  const relativeIndex = index - start;
  const before = escapeHtml(snippet.slice(0, relativeIndex));
  const match = escapeHtml(snippet.slice(relativeIndex, relativeIndex + q.length));
  const after = escapeHtml(snippet.slice(relativeIndex + q.length));
  const prefix = start > 0 ? "... " : "";
  const suffix = end < text.length ? " ..." : "";
  return `${prefix}${before}<mark>${match}</mark>${after}${suffix}`;
}

function formatDate(value) {
  if (!value) return "Unknown upload date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusCounts(docs) {
  const ready = docs.filter((doc) => doc.status === "ready").length;
  const processing = docs.filter((doc) => doc.status === "processing" || doc.status === "uploaded").length;
  return { ready, processing };
}

function getDocumentLimit(profile) {
  if (profile?.document_limit) return Number(profile.document_limit);

  if (profile?.subscription_tier === "starter") return 250;
  if (profile?.subscription_tier === "organization") return 2500;
  return 25;
}

function renderProfile() {
  const profile = currentProfile;
  const tier = titleCase(profile?.subscription_tier || "free");
  const status = titleCase(profile?.account_status || "active");
  const limit = getDocumentLimit(profile);

  if (accountName) {
    accountName.textContent = profile?.full_name || currentSession?.user?.email || "-";
  }

  if (accountOrganization) {
    accountOrganization.textContent = profile?.organization_name || "-";
  }

  if (accountRole) {
    accountRole.textContent = profile?.role || "-";
  }

  if (accountTier) {
    accountTier.textContent = tier;
  }

  if (accountStatus) {
    accountStatus.textContent = status;
  }

  if (accountLimit) {
    accountLimit.textContent = `${limit} documents`;
  }

  if (accountCustomerId) {
    accountCustomerId.textContent = profile?.stripe_customer_id || "Not connected";
  }

  if (accountSubscriptionId) {
    accountSubscriptionId.textContent = profile?.stripe_subscription_id || "Not connected";
  }

  if (billingNote) {
    billingNote.textContent = profile?.stripe_customer_id
      ? "This account has Stripe billing metadata attached and is ready for subscription status syncing."
      : "This account is on the free tier. Stripe customer and subscription IDs can be attached later without changing the account model.";
  }

  if (userBadge) {
    if (currentSession?.user) {
      userBadge.textContent = `${tier} · ${currentSession.user.email || currentSession.user.id}`;
    } else {
      userBadge.textContent = "";
    }
  }
}

async function syncProfileFromSession() {
  if (!supabase || !currentSession?.user) return;

  const metadata = currentSession.user.user_metadata || {};
  const updates = {
    email: currentSession.user.email || null,
    full_name: metadata.full_name || null,
    organization_name: metadata.organization_name || null,
    role: metadata.role || null,
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", currentSession.user.id);

  if (error) {
    console.error("Profile sync failed", error.message);
  }
}

async function loadProfile() {
  if (!supabase || !currentSession?.user) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, organization_name, role, subscription_tier, account_status, document_limit, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_current_period_end")
    .eq("id", currentSession.user.id)
    .maybeSingle();

  if (error) {
    console.error("Unable to load profile", error.message);
    currentProfile = null;
    renderProfile();
    return;
  }

  currentProfile = data || null;
  renderProfile();
}

function renderDocuments() {
  const query = searchQueryInput.value.trim().toLowerCase();
  const wantedStatus = searchStatusSelect.value;

  const filtered = documentsCache.filter((doc) => {
    const statusMatch = wantedStatus === "all" || doc.status === wantedStatus;
    if (!statusMatch) return false;
    if (!query) return true;
    const haystack = `${doc.title || ""} ${doc.original_filename || ""} ${doc.extracted_text || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  docList.innerHTML = "";
  show(docEmpty, filtered.length === 0);

  filtered.forEach((doc) => {
    const card = document.createElement("article");
    card.className = "doc-card";

    const title = escapeHtml(doc.title || doc.original_filename || "Untitled document");
    const fileName = escapeHtml(doc.original_filename || "Unknown file");
    const metaBits = [
      fileName,
      doc.year ? `Year ${escapeHtml(doc.year)}` : "",
      doc.month ? escapeHtml(doc.month) : "",
      formatDate(doc.created_at),
    ].filter(Boolean);

    const snippet = snippetFromText(doc.extracted_text || "", query);
    const errorBlock = doc.processing_error
      ? `<p class="doc-error">${escapeHtml(doc.processing_error)}</p>`
      : "";

    card.innerHTML = `
      <div class="doc-meta">
        <div>
          <p class="doc-title">${title}</p>
          <p class="doc-subtitle">${metaBits.join(" · ")}</p>
        </div>
        <span class="doc-status">${escapeHtml(doc.status || "uploaded")}</span>
      </div>
      <p class="doc-snippet">${snippet}</p>
      ${errorBlock}
      <div class="doc-actions">
        <button class="btn secondary" type="button" data-action="download" data-id="${doc.id}">Open file</button>
      </div>
    `;

    docList.append(card);
  });

  const counts = statusCounts(documentsCache);
  statFiles.textContent = String(documentsCache.length);
  statReady.textContent = String(counts.ready);
  statProcessing.textContent = String(counts.processing);
}

async function loadDocuments() {
  if (!supabase || !currentSession?.user) return;

  setStatus(docsStatus, "Loading documents...");
  const { data, error } = await supabase
    .from("documents")
    .select("id, title, original_filename, storage_path, status, processing_error, extracted_text, year, month, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    setStatus(docsStatus, error.message, "error");
    return;
  }

  documentsCache = Array.isArray(data) ? data : [];
  renderDocuments();
  setStatus(docsStatus, `${documentsCache.length} document${documentsCache.length === 1 ? "" : "s"} loaded.`, "success");
}

async function openFile(documentId) {
  const doc = documentsCache.find((item) => item.id === documentId);
  if (!doc) return;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(doc.storage_path, 60 * 60);

  if (error || !data?.signedUrl) {
    setStatus(docsStatus, error?.message || "Unable to create signed URL.", "error");
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener");
}

async function uploadDocument(event) {
  event.preventDefault();
  if (!supabase || !currentSession?.user) return;

  const documentLimit = getDocumentLimit(currentProfile);
  if (documentsCache.length >= documentLimit) {
    setStatus(uploadStatus, `Your ${titleCase(currentProfile?.subscription_tier || "free")} plan is limited to ${documentLimit} documents right now.`, "error");
    return;
  }

  const file = uploadFileInput.files?.[0];
  if (!file) {
    setStatus(uploadStatus, "Choose a file before uploading.", "error");
    return;
  }

  const userId = currentSession.user.id;
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
  const storagePath = `${userId}/${timestamp}-${sanitizedName}`;
  const title = uploadTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, "");
  let extractedText = "";

  setStatus(uploadStatus, "Extracting text in browser...");

  try {
    extractedText = await extractTextFromFile(file);
  } catch (error) {
    setStatus(uploadStatus, error instanceof Error ? error.message : "Text extraction failed.", "error");
    return;
  }

  setStatus(uploadStatus, "Uploading file...");

  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false });

  if (storageError) {
    setStatus(uploadStatus, storageError.message, "error");
    return;
  }

  setStatus(uploadStatus, "Saving metadata...");

  const { error: insertError } = await supabase
    .from("documents")
    .insert({
      user_id: userId,
      title,
      original_filename: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      file_size: file.size,
      year: uploadYearInput.value.trim() || null,
      month: uploadMonthInput.value.trim() || null,
      status: "ready",
      processing_error: null,
      extracted_text: extractedText,
    })
    ;

  if (insertError) {
    setStatus(uploadStatus, insertError?.message || "Document metadata insert failed.", "error");
    return;
  }

  setStatus(uploadStatus, "Upload complete.");
  uploadForm.reset();
  setStatus(uploadStatus, "Upload and text extraction complete.", "success");
  await loadDocuments();
}

async function handleSignup(event) {
  event.preventDefault();
  if (!supabase) return;

  const fullName = document.getElementById("signup-full-name").value.trim();
  const organizationName = document.getElementById("signup-organization").value.trim();
  const role = document.getElementById("signup-role").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  setStatus(authStatus, "Creating account...");

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
    setStatus(authStatus, error.message, "error");
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
      setStatus(authStatus, `Account created, but profile save failed: ${profileError.message}`, "error");
      return;
    }
  }

  setStatus(authStatus, "Account created. Check your email if confirmation is enabled, then sign in.", "success");
}

async function handleSignin(event) {
  event.preventDefault();
  if (!supabase) return;

  const email = document.getElementById("signin-email").value.trim();
  const password = document.getElementById("signin-password").value;
  setStatus(authStatus, "Signing in...");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setStatus(authStatus, error.message, "error");
    return;
  }

  setStatus(authStatus, "Signed in.", "success");
}

async function handleSignout() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    setStatus(authStatus, error.message, "error");
  }
}

async function handleDocAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const id = button.getAttribute("data-id");
  const action = button.getAttribute("data-action");
  if (!id || !action) return;

  if (action === "download") {
    await openFile(id);
  }
}

function renderSession(session) {
  currentSession = session;
  const isAuthed = Boolean(session?.user);
  show(setupPanel, !config.supabaseUrl || !config.supabaseAnonKey);
  show(authPanel, Boolean(config.supabaseUrl && config.supabaseAnonKey) && !isAuthed);
  show(appPanel, Boolean(config.supabaseUrl && config.supabaseAnonKey) && isAuthed);

  if (isAuthed) {
    currentProfile = null;
    renderProfile();
    syncProfileFromSession().then(loadProfile);
    loadDocuments();
  } else {
    currentProfile = null;
    renderProfile();
    documentsCache = [];
    renderDocuments();
  }
}

function attachEvents() {
  signupForm?.addEventListener("submit", handleSignup);
  signinForm?.addEventListener("submit", handleSignin);
  showSigninButton?.addEventListener("click", () => toggleSignup(false));
  showSignupButton?.addEventListener("click", () => toggleSignup(true));
  signoutButton?.addEventListener("click", handleSignout);
  uploadForm?.addEventListener("submit", uploadDocument);
  refreshButton?.addEventListener("click", loadDocuments);
  docList?.addEventListener("click", handleDocAction);

  searchQueryInput?.addEventListener("input", renderDocuments);
  searchStatusSelect?.addEventListener("change", renderDocuments);
  searchResetButton?.addEventListener("click", () => {
    searchQueryInput.value = "";
    searchStatusSelect.value = "all";
    renderDocuments();
  });
}

async function init() {
  const hasConfig = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  show(setupPanel, !hasConfig);
  show(authPanel, hasConfig);
  show(appPanel, false);

  if (!hasConfig) return;

  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  toggleSignup(false);
  attachEvents();

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    setStatus(authStatus, error.message, "error");
  }
  renderSession(data?.session || null);

  supabase.auth.onAuthStateChange((_event, session) => {
    renderSession(session);
  });
}

init();
