(function () {
  const widgets = document.querySelectorAll(".js-inquiry-widget");

  function setStatus(statusNode, message, isError) {
    statusNode.textContent = message || "";
    statusNode.classList.toggle("is-error", Boolean(isError));
  }

  widgets.forEach(function (root) {
    const openButton = root.querySelector('[data-role="open-form"]');
    const ctaRow = root.querySelector('[data-role="cta-row"]');
    const formShell = root.querySelector('[data-role="form-shell"]');
    const form = root.querySelector('[data-role="form"]');
    const status = root.querySelector('[data-role="status"]');
    const successPanel = root.querySelector('[data-role="success"]');
    const submitButton = root.querySelector('[data-role="submit"]');
    const resetButton = root.querySelector('[data-role="reset"]');
    const firstInput = root.querySelector('[data-role="first-input"]');
    const endpoint = root.getAttribute("data-endpoint") || "/api/project-inquiry";
    const submitLabel = form ? form.getAttribute("data-submit-label") || "Submit" : "Submit";

    if (!openButton || !ctaRow || !formShell || !form || !status || !successPanel || !submitButton) {
      return;
    }

    function openForm() {
      formShell.classList.add("is-open");
      openButton.setAttribute("aria-expanded", "true");
      ctaRow.classList.add("is-hidden");
      ctaRow.hidden = true;
    }

    function showForm() {
      form.hidden = false;
      successPanel.hidden = true;
      setStatus(status, "");
    }

    openButton.addEventListener("click", function () {
      openForm();
      showForm();
      if (firstInput) firstInput.focus();
    });

    if (resetButton) {
      resetButton.addEventListener("click", function () {
        form.reset();
        showForm();
        openForm();
        if (firstInput) firstInput.focus();
      });
    }

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      setStatus(status, "");

      if (!form.reportValidity()) {
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Submitting...";

      const formData = new FormData(form);
      const payload = {};
      formData.forEach(function (value, key) {
        payload[key] = String(value || "").trim();
      });

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json().catch(function () {
          return {};
        });

        if (!response.ok) {
          throw new Error(data.error || "Unable to submit right now.");
        }

        form.hidden = true;
        successPanel.hidden = false;
        form.reset();
      } catch (error) {
        setStatus(status, error.message || "Unable to submit right now.", true);
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    });
  });
}());
