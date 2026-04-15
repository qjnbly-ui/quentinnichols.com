import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.8";

const config = window.RECORDS_APP_CONFIG || {};
const setupPanel = document.getElementById("setup-panel");
const authPanel = document.getElementById("auth-panel");
const appPanel = document.getElementById("app-panel");

const authStatus = document.getElementById("auth-status");
const uploadStatus = document.getElementById("upload-status");
const docsStatus = document.getElementById("docs-status");
const userBadge = document.getElementById("user-badge");

const signupForm = document.getElementById("signup-form");
const signinForm = document.getElementById("signin-form");
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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
        <button class="btn secondary" type="button" data-action="extract" data-id="${doc.id}">Run extraction</button>
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

async function runExtraction(documentId) {
  if (!supabase) return;
  setStatus(uploadStatus, "Running extraction...");
  const { error } = await supabase.functions.invoke("ingest-document", {
    body: { documentId },
  });

  if (error) {
    setStatus(uploadStatus, error.message, "error");
    return;
  }

  setStatus(uploadStatus, "Extraction finished.", "success");
  await loadDocuments();
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

  setStatus(uploadStatus, "Uploading file...");

  const { error: storageError } = await supabase.storage
    .from("documents")
    .upload(storagePath, file, { upsert: false });

  if (storageError) {
    setStatus(uploadStatus, storageError.message, "error");
    return;
  }

  setStatus(uploadStatus, "Saving metadata...");

  const { data: inserted, error: insertError } = await supabase
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
      status: "uploaded",
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    setStatus(uploadStatus, insertError?.message || "Document metadata insert failed.", "error");
    return;
  }

  setStatus(uploadStatus, "File uploaded. Extracting text...");
  uploadForm.reset();

  const { error: ingestError } = await supabase.functions.invoke("ingest-document", {
    body: { documentId: inserted.id },
  });

  if (ingestError) {
    setStatus(uploadStatus, `Upload succeeded, but extraction failed: ${ingestError.message}`, "error");
    await loadDocuments();
    return;
  }

  setStatus(uploadStatus, "Upload and text extraction complete.", "success");
  await loadDocuments();
}

async function handleSignup(event) {
  event.preventDefault();
  if (!supabase) return;

  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  setStatus(authStatus, "Creating account...");

  const { error } = await supabase.auth.signUp({ email, password });
  if (error) {
    setStatus(authStatus, error.message, "error");
    return;
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

  if (action === "extract") {
    await runExtraction(id);
  }
}

function renderSession(session) {
  currentSession = session;
  const isAuthed = Boolean(session?.user);
  show(setupPanel, !config.supabaseUrl || !config.supabaseAnonKey);
  show(authPanel, Boolean(config.supabaseUrl && config.supabaseAnonKey) && !isAuthed);
  show(appPanel, Boolean(config.supabaseUrl && config.supabaseAnonKey) && isAuthed);

  if (isAuthed) {
    userBadge.textContent = session.user.email || session.user.id;
    loadDocuments();
  } else {
    documentsCache = [];
    renderDocuments();
  }
}

function attachEvents() {
  signupForm?.addEventListener("submit", handleSignup);
  signinForm?.addEventListener("submit", handleSignin);
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
