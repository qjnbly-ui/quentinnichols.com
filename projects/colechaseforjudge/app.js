const campaignAccessKey = "cole-chase-campaign-access";
const campaignPassword = "cole2026";
const gateForm = document.querySelector("#campaign-gate-form");
const gateFeedback = document.querySelector("#campaign-gate-feedback");

const normalizePassword = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();

const unlockCampaignSite = () => {
  document.body.classList.remove("is-locked");
};

const lockCampaignSite = () => {
  document.body.classList.add("is-locked");
};

if (localStorage.getItem(campaignAccessKey) === "granted") {
  unlockCampaignSite();
} else {
  lockCampaignSite();
}

if (gateForm && gateFeedback) {
  gateForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(gateForm);
    const password = normalizePassword(formData.get("password"));

    if (password !== campaignPassword) {
      gateFeedback.textContent = "Incorrect password. Campaign team access only.";
      return;
    }

    localStorage.setItem(campaignAccessKey, "granted");
    gateFeedback.textContent = "";
    gateForm.reset();
    unlockCampaignSite();
  });
}

const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navLinks.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const buildMailtoLink = ({ subject, lines }) => {
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:cole.p.chase@gmail.com?subject=${encodeURIComponent(subject)}&body=${body}`;
};

document.querySelectorAll("[data-newsletter-form]").forEach((newsletterForm) => {
  const newsletterFeedback = newsletterForm.nextElementSibling;
  if (!newsletterFeedback) return;

  newsletterForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(newsletterForm);
    const email = String(formData.get("email") || "").trim();
    const zip = String(formData.get("zip") || "").trim();

    if (!email) {
      newsletterFeedback.textContent = "Enter an email address first.";
      return;
    }

    localStorage.setItem(
      "cole-chase-newsletter",
      JSON.stringify({ email, zip, updatedAt: new Date().toISOString() })
    );

    newsletterFeedback.textContent =
      "Signup saved on this device. Replace this with the real campaign signup service when ready.";
  });
});

const volunteerForm = document.querySelector("#volunteer-form");
const volunteerFeedback = document.querySelector("#volunteer-feedback");

if (volunteerForm && volunteerFeedback) {
  volunteerForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(volunteerForm);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const interest = String(formData.get("interest") || "").trim();
    const message = String(formData.get("message") || "").trim();

    if (!name || !email) {
      volunteerFeedback.textContent = "Name and email are required.";
      return;
    }

    localStorage.setItem(
      "cole-chase-volunteer",
      JSON.stringify({ name, email, phone, interest, message, updatedAt: new Date().toISOString() })
    );

    volunteerFeedback.textContent =
      "Contact saved on this device. Your mail app will open so this can be sent to the campaign inbox.";

    window.location.href = buildMailtoLink({
      subject: `Campaign contact: ${interest || "Volunteer"}`,
      lines: [
        `Name: ${name}`,
        `Email: ${email}`,
        `Phone: ${phone || "Not provided"}`,
        `Interest: ${interest || "Not provided"}`,
        "",
        "Message:",
        message || "No message provided."
      ]
    });
  });
}

document.querySelectorAll("[data-placeholder-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const label = link.getAttribute("data-placeholder-link") || "link";
    window.alert(`Replace the ${label} placeholder link before publishing this site.`);
  });
});
