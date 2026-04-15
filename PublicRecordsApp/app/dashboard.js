import JSZip from "https://esm.sh/jszip@3.10.1";
import { createBrowserSupabase, hasConfig, getSessionOrNull } from "./lib/supabase-client.js";
import { PLAN_ORDER, getPlanConfig, formatPlanName } from "./lib/plan-config.js";

const setupPanel = document.getElementById("setup-panel");
const dashboardPanel = document.getElementById("dashboard-panel");
const uploadStatus = document.getElementById("upload-status");
const docsStatus = document.getElementById("docs-status");
const mobileLogoutButton = document.getElementById("mobile-logout-button");
const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const mobileMenu = document.getElementById("mobile-menu");
const mobileMenuAccount = document.getElementById("mobile-menu-account");
const mobileMenuLibrary = document.getElementById("mobile-menu-library");
const accountSection = document.getElementById("account-section");
const librarySection = document.getElementById("library-section");
const fileModal = document.getElementById("file-modal");
const fileModalTitle = document.getElementById("file-modal-title");
const fileModalFrame = document.getElementById("file-modal-frame");
const fileModalDownload = document.getElementById("file-modal-download");
const fileModalClose = document.getElementById("file-modal-close");
const profileSettingsToggle = document.getElementById("profile-settings-toggle");
const profileSettingsModal = document.getElementById("profile-settings-modal");
const profileSettingsClose = document.getElementById("profile-settings-close");
const openUploadModalButton = document.getElementById("open-upload-modal");
const uploadModal = document.getElementById("upload-modal");
const uploadModalClose = document.getElementById("upload-modal-close");
const accountName = document.getElementById("account-name");
const accountEmail = document.getElementById("account-email");
const accountOrganization = document.getElementById("account-organization");
const accountRole = document.getElementById("account-role");
const accountTier = document.getElementById("account-tier");
const accountStatus = document.getElementById("account-status");
const accountLimit = document.getElementById("account-limit");
const accountRemaining = document.getElementById("account-remaining");
const accountCustomerId = document.getElementById("account-customer-id");
const accountSubscriptionId = document.getElementById("account-subscription-id");
const accountPriceId = document.getElementById("account-price-id");
const accountProfileId = document.getElementById("account-profile-id");
const accountPeriodEnd = document.getElementById("account-period-end");
const currentPlanName = document.getElementById("current-plan-name");
const currentPlanCopy = document.getElementById("current-plan-copy");
const changePlanButton = document.getElementById("change-plan-button");
const billingPlanPicker = document.getElementById("billing-plan-picker");
const billingPlanGrid = document.getElementById("billing-plan-grid");
const profileForm = document.getElementById("profile-form");
const profileFullNameInput = document.getElementById("profile-full-name");
const profileOrganizationInput = document.getElementById("profile-organization");
const profileRoleInput = document.getElementById("profile-role");
const profileStatus = document.getElementById("profile-status");
const uploadForm = document.getElementById("upload-form");
const searchQueryInput = document.getElementById("search-query");
const searchYearSelect = document.getElementById("search-year");
const searchResetButton = document.getElementById("search-reset");
const uploadTitleInput = document.getElementById("upload-title");
const uploadYearInput = document.getElementById("upload-year");
const uploadMonthInput = document.getElementById("upload-month");
const uploadFileInput = document.getElementById("upload-file");
const docList = document.getElementById("doc-list");
const docEmpty = document.getElementById("doc-empty");

let supabase = null;
let currentSession = null;
let currentProfile = null;
let documentsCache = [];

function getInitialSection() {
  const params = new URLSearchParams(window.location.search);
  return params.get("section") === "library" ? "library" : "account";
}

function setMenuActive(section) {
  mobileMenuAccount.classList.toggle("is-active", section === "account");
  mobileMenuLibrary.classList.toggle("is-active", section === "library");
}

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

function closeMobileMenu() {
  if (!mobileMenu || !mobileMenuToggle) return;
  mobileMenu.classList.remove("is-open");
  mobileMenu.classList.add("hidden");
  mobileMenuToggle.setAttribute("aria-expanded", "false");
}

function toggleMobileMenu() {
  if (!mobileMenu || !mobileMenuToggle) return;
  const nextOpen = !mobileMenu.classList.contains("is-open");
  mobileMenu.classList.toggle("is-open", nextOpen);
  mobileMenu.classList.toggle("hidden", !nextOpen);
  mobileMenuToggle.setAttribute("aria-expanded", String(nextOpen));
}

function setProfileSettingsOpen(isOpen) {
  profileSettingsModal.classList.toggle("is-open", isOpen);
  profileSettingsModal.setAttribute("aria-hidden", String(!isOpen));
  profileSettingsToggle.setAttribute("aria-expanded", String(isOpen));
}

function setUploadModalOpen(isOpen) {
  uploadModal.classList.toggle("is-open", isOpen);
  uploadModal.setAttribute("aria-hidden", String(!isOpen));
}

function showSection(section) {
  const isAccount = section === "account";
  const isLibrary = section === "library";
  accountSection.hidden = !isAccount;
  librarySection.hidden = isAccount;
  setMenuActive(section);
  if (!isAccount) {
    setProfileSettingsOpen(false);
    setBillingPlanPickerOpen(false);
  }
  if (!isLibrary) {
    setUploadModalOpen(false);
  }
  closeMobileMenu();
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

function decodeXmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value) {
  if (!value) return "Unknown upload date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getDocumentLimit(profile) {
  if (profile?.document_limit) return Number(profile.document_limit);
  return getPlanConfig(profile?.subscription_tier).documentLimit;
}

function setBillingPlanPickerOpen(isOpen) {
  billingPlanPicker.classList.toggle("hidden", !isOpen);
  changePlanButton.setAttribute("aria-expanded", String(isOpen));
  changePlanButton.textContent = isOpen ? "Hide plans" : "Change plan";
}

function renderBillingPlans(profile, remaining) {
  const activePlanId = profile?.subscription_tier || "free";
  const activePlan = getPlanConfig(activePlanId);

  currentPlanName.textContent = activePlan.name;
  currentPlanCopy.textContent = `${activePlan.priceLabel} · ${activePlan.documentLimit} documents · ${remaining} remaining`;

  billingPlanGrid.innerHTML = PLAN_ORDER.map((planId) => {
    const plan = getPlanConfig(planId);
    const isCurrent = planId === activePlanId;
    const badge = isCurrent ? '<span class="plan-badge">Current</span>' : "";
    const currentCopy = isCurrent
      ? `<p class="plan-footnote">${remaining} document${remaining === 1 ? "" : "s"} remaining on this plan.</p>`
      : "";

    return `
      <article class="plan-card${isCurrent ? " is-current" : ""}">
        <div class="plan-card-head">
          <div>
            <p class="plan-name">${plan.name}</p>
            <p class="plan-price">${plan.priceLabel}</p>
          </div>
          ${badge}
        </div>
        <p class="plan-summary">${plan.summary}</p>
        <p class="plan-limit">${plan.documentLimit} documents</p>
        <ul class="plan-features">
          ${plan.features.map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
        </ul>
        ${currentCopy}
      </article>
    `;
  }).join("");
}

function buildPreviewUrl(doc, signedUrl) {
  const lowerName = String(doc?.original_filename || "").toLowerCase();
  if (lowerName.endsWith(".docx") || lowerName.endsWith(".doc")) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;
  }
  return signedUrl;
}

async function extractDocxText(file) {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const xmlFile = zip.file("word/document.xml");
  if (!xmlFile) throw new Error("This DOCX file is missing word/document.xml.");
  const xml = await xmlFile.async("string");
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  return cleanWhitespace(
    paragraphs
      .map((paragraph) => {
        const runs = paragraph.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
        return runs
          .map((run) => run.replace(/<\/?w:t[^>]*>/g, ""))
          .map((value) => decodeXmlEntities(value))
          .join(" ");
      })
      .join("\n")
  );
}

async function extractTextFromFile(file) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".docx")) return extractDocxText(file);

  if (
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json") ||
    lowerName.endsWith(".html") ||
    lowerName.endsWith(".htm")
  ) {
    return cleanWhitespace(await file.text());
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

function renderProfile() {
  const profile = currentProfile;
  const tier = formatPlanName(profile?.subscription_tier || "free");
  const limit = getDocumentLimit(profile);
  const remaining = Math.max(limit - documentsCache.length, 0);

  accountName.textContent = profile?.full_name || currentSession?.user?.email || "-";
  accountEmail.textContent = currentSession?.user?.email || profile?.email || "-";
  accountOrganization.textContent = profile?.organization_name || "-";
  accountRole.textContent = profile?.role || "-";
  accountTier.textContent = tier;
  accountStatus.textContent = titleCase(profile?.account_status || "active");
  accountLimit.textContent = `${limit} documents`;
  accountRemaining.textContent = `${remaining} documents`;
  accountProfileId.textContent = currentSession?.user?.id || profile?.id || "-";
  accountPeriodEnd.textContent = profile?.subscription_current_period_end
    ? formatDate(profile.subscription_current_period_end)
    : "Not set";
  accountCustomerId.textContent = profile?.stripe_customer_id || "Not connected";
  accountSubscriptionId.textContent = profile?.stripe_subscription_id || "Not connected";
  accountPriceId.textContent = profile?.stripe_price_id || "Not connected";
  renderBillingPlans(profile, remaining);
  profileFullNameInput.value = profile?.full_name || "";
  profileOrganizationInput.value = profile?.organization_name || "";
  profileRoleInput.value = profile?.role || "";
}

async function syncProfileFromSession() {
  const metadata = currentSession.user.user_metadata || {};
  const updates = {
    email: currentSession.user.email || null,
    full_name: metadata.full_name || null,
    organization_name: metadata.organization_name || null,
    role: metadata.role || null,
  };

  await supabase.from("profiles").update(updates).eq("id", currentSession.user.id);
}

async function loadProfile() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, organization_name, role, subscription_tier, account_status, document_limit, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_current_period_end")
    .eq("id", currentSession.user.id)
    .maybeSingle();

  if (error) {
    console.error("Unable to load profile", error.message);
    currentProfile = null;
  } else {
    currentProfile = data || null;
  }

  renderProfile();
}

async function handleProfileSave(event) {
  event.preventDefault();
  setStatus(profileStatus, "Saving profile...");

  const updates = {
    full_name: profileFullNameInput.value.trim() || null,
    organization_name: profileOrganizationInput.value.trim() || null,
    role: profileRoleInput.value.trim() || null,
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", currentSession.user.id);

  if (error) {
    setStatus(profileStatus, error.message, "error");
    return;
  }

  currentProfile = {
    ...(currentProfile || {}),
    ...updates,
  };
  renderProfile();
  setStatus(profileStatus, "Profile updated.", "success");
}

function renderDocuments() {
  const query = searchQueryInput.value.trim().toLowerCase();
  const selectedYear = searchYearSelect.value;

  docList.innerHTML = "";

  if (!query) {
    show(docEmpty, true);
    docEmpty.textContent = "Type a keyword to search your documents.";
    renderProfile();
    return;
  }

  const filtered = documentsCache.filter((doc) => {
    const yearMatch = selectedYear === "all" || String(doc.year || "") === selectedYear;
    if (!yearMatch) return false;
    const haystack = `${doc.title || ""} ${doc.original_filename || ""} ${doc.extracted_text || ""}`.toLowerCase();
    return haystack.includes(query);
  });

  show(docEmpty, filtered.length === 0);
  if (filtered.length === 0) {
    docEmpty.textContent = "No documents match your search.";
  }

  filtered.forEach((doc) => {
    const title = escapeHtml(doc.title || doc.original_filename || "Untitled document");
    const fileName = escapeHtml(doc.original_filename || "Unknown file");
    const metaBits = [
      fileName,
      doc.year ? `Year ${escapeHtml(doc.year)}` : "",
      doc.month ? escapeHtml(doc.month) : "",
      formatDate(doc.created_at),
    ].filter(Boolean);

    const card = document.createElement("article");
    card.className = "doc-card";
    card.innerHTML = `
      <div class="doc-meta">
        <div>
          <p class="doc-title">${title}</p>
          <p class="doc-subtitle">${metaBits.join(" · ")}</p>
        </div>
        <span class="doc-status">${escapeHtml(doc.status || "uploaded")}</span>
      </div>
      <p class="doc-snippet">${snippetFromText(doc.extracted_text || "", query)}</p>
      <div class="doc-actions">
        <button class="btn secondary" type="button" data-action="download" data-id="${doc.id}">Open file</button>
      </div>
    `;
    docList.append(card);
  });

  renderProfile();
}

function updateYearFilterOptions() {
  const years = Array.from(
    new Set(
      documentsCache
        .map((doc) => String(doc.year || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => Number(b) - Number(a));

  searchYearSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All years";
  searchYearSelect.append(allOption);

  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    searchYearSelect.append(option);
  });
}

async function loadDocuments() {
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
  updateYearFilterOptions();
  renderDocuments();
  setStatus(docsStatus, `${documentsCache.length} document${documentsCache.length === 1 ? "" : "s"} loaded.`, "success");
}

async function createSignedUrlForDocument(documentId) {
  const doc = documentsCache.find((item) => item.id === documentId);
  if (!doc) return null;

  const { data, error } = await supabase.storage.from("documents").createSignedUrl(doc.storage_path, 60 * 60);
  if (error || !data?.signedUrl) {
    setStatus(docsStatus, error?.message || "Unable to create signed URL.", "error");
    return null;
  }

  return { doc, signedUrl: data.signedUrl };
}

async function openFile(documentId) {
  const signed = await createSignedUrlForDocument(documentId);
  if (!signed) return;
  const { doc, signedUrl } = signed;

  fileModalTitle.textContent = doc.title || doc.original_filename || "File preview";
  fileModalFrame.src = buildPreviewUrl(doc, signedUrl);
  fileModalDownload.href = signedUrl;
  fileModalDownload.setAttribute("download", doc.original_filename || "download");
  fileModal.classList.add("is-open");
  fileModal.setAttribute("aria-hidden", "false");
}

function closeFileModal() {
  fileModal.classList.remove("is-open");
  fileModal.setAttribute("aria-hidden", "true");
  fileModalFrame.src = "";
}

async function uploadDocument(event) {
  event.preventDefault();
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
  const storagePath = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
  const title = uploadTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, "");

  setStatus(uploadStatus, "Extracting text in browser...");
  let extractedText = "";
  try {
    extractedText = await extractTextFromFile(file);
  } catch (error) {
    setStatus(uploadStatus, error instanceof Error ? error.message : "Text extraction failed.", "error");
    return;
  }

  setStatus(uploadStatus, "Uploading file...");
  const { error: storageError } = await supabase.storage.from("documents").upload(storagePath, file, { upsert: false });
  if (storageError) {
    setStatus(uploadStatus, storageError.message, "error");
    return;
  }

  const { error: insertError } = await supabase.from("documents").insert({
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
  });

  if (insertError) {
    setStatus(uploadStatus, insertError.message || "Document metadata insert failed.", "error");
    return;
  }

  uploadForm.reset();
  setStatus(uploadStatus, "Upload and text extraction complete.", "success");
  setUploadModalOpen(false);
  await loadDocuments();
}

async function handleSignout() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setStatus(docsStatus, error.message, "error");
    return;
  }
  window.location.replace("./login.html");
}

async function handleDocAction(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.getAttribute("data-action");
  const id = button.getAttribute("data-id");
  if (!id || !action) return;

  if (action === "download") await openFile(id);
}

async function init() {
  show(setupPanel, !hasConfig());
  show(dashboardPanel, false);
  if (!hasConfig()) return;

  supabase = createBrowserSupabase();
  currentSession = await getSessionOrNull(supabase);

  if (!currentSession?.user) {
    window.location.replace("./login.html");
    return;
  }

  show(setupPanel, false);
  show(dashboardPanel, true);

  await syncProfileFromSession();
  await loadProfile();
  await loadDocuments();
  showSection(getInitialSection());

  mobileLogoutButton.addEventListener("click", handleSignout);
  mobileMenuToggle.addEventListener("click", toggleMobileMenu);
  mobileMenuAccount.addEventListener("click", () => showSection("account"));
  mobileMenuLibrary.addEventListener("click", () => showSection("library"));
  changePlanButton.addEventListener("click", () => {
    const isOpen = changePlanButton.getAttribute("aria-expanded") === "true";
    setBillingPlanPickerOpen(!isOpen);
  });
  openUploadModalButton.addEventListener("click", () => setUploadModalOpen(true));
  profileSettingsToggle.addEventListener("click", () => {
    const isOpen = profileSettingsToggle.getAttribute("aria-expanded") === "true";
    setProfileSettingsOpen(!isOpen);
  });
  profileForm.addEventListener("submit", handleProfileSave);
  uploadForm.addEventListener("submit", uploadDocument);
  searchQueryInput.addEventListener("input", renderDocuments);
  searchYearSelect.addEventListener("change", renderDocuments);
  searchResetButton.addEventListener("click", () => {
    searchQueryInput.value = "";
    searchYearSelect.value = "all";
    renderDocuments();
  });
  docList.addEventListener("click", handleDocAction);
  fileModalClose.addEventListener("click", closeFileModal);
  fileModal.addEventListener("click", (event) => {
    if (event.target === fileModal) closeFileModal();
  });
  uploadModalClose.addEventListener("click", () => setUploadModalOpen(false));
  uploadModal.addEventListener("click", (event) => {
    if (event.target === uploadModal) setUploadModalOpen(false);
  });
  profileSettingsClose.addEventListener("click", () => setProfileSettingsOpen(false));
  profileSettingsModal.addEventListener("click", (event) => {
    if (event.target === profileSettingsModal) setProfileSettingsOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && fileModal.classList.contains("is-open")) {
      closeFileModal();
      return;
    }
    if (event.key === "Escape" && uploadModal.classList.contains("is-open")) {
      setUploadModalOpen(false);
      return;
    }
    if (event.key === "Escape" && profileSettingsModal.classList.contains("is-open")) {
      setProfileSettingsOpen(false);
      return;
    }
    if (event.key === "Escape") closeMobileMenu();
  });
  document.addEventListener("click", (event) => {
    if (!mobileMenu.classList.contains("is-open")) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (mobileMenu.contains(target) || mobileMenuToggle.contains(target)) return;
    closeMobileMenu();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      window.location.replace("./login.html");
    }
  });
}

init();
