/**
 * Vyntyra Internship Application System
 * Frontend integration with Node.js backend API and Razorpay payment gateway
 */

// Auto-detect API base URL
/*
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const isProduction = !localHosts.has(window.location.hostname);
const configuredApiBase = document.body?.dataset?.apiBase?.trim();
const API_BASE_CANDIDATES = isProduction
  ? [configuredApiBase, `${window.location.origin}/api`, "https://vyntyrainternships-backend.onrender.com/api"]
  : [configuredApiBase, "https://vyntyrainternships-backend.onrender.com/api", `${window.location.origin}/api`]
      .filter(Boolean);

const UNIQUE_API_BASE_CANDIDATES = [...new Set(API_BASE_CANDIDATES)];
let activeApiBase = UNIQUE_API_BASE_CANDIDATES.find(Boolean) || "";
*/

const API_BASE = "https://vyntyrainternships-backend.onrender.com/api";
// Live Razorpay public key
const RAZORPAY_KEY = "rzp_live_SUgru3eERmlvUC";

// Fee amount in INR
const APPLICATION_FEE = 499;

let applicationData = {};
let isPaymentConfirmed = false;

async function apiFetch(path, options = {}) {
  const { expectsJson = true, ...fetchOptions } = options;

  try {
    const response = await fetch(`${API_BASE}${path}`, fetchOptions);

    if (expectsJson) {
      const contentType = (response.headers.get("content-type") || "").toLowerCase();

      if (!contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error("Invalid response from server (not JSON)");
      }
    }

    return response;

  } catch (error) {
    console.error("API Error:", error);
    throw new Error("Unable to reach backend server. Please try again in a few moments.");
  }
}

async function readJsonResponse(response, operationLabel) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  if (!contentType.includes("application/json")) {
    const raw = await response.text();
    const compactPreview = raw.replace(/\s+/g, " ").trim().slice(0, 120);
    const htmlLike = /<!doctype|<html|<body/i.test(raw);
    const detail = htmlLike
      ? "Received an HTML page instead of API JSON."
      : `Received non-JSON response: ${compactPreview || "empty body"}`;
    throw new Error(`${operationLabel}. ${detail}`);
  }

  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${operationLabel}. Invalid JSON response from backend.`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".apply-form");
  const payBtn = document.getElementById("pay-registration-fee-btn");
  const submitBtn = form?.querySelector('button[type="submit"]');
  const domainSelect = form?.querySelector('select[name="preferred_domain"]');

  if (!form || !payBtn || !submitBtn) {
    console.error("Application form controls not found in DOM");
    return;
  }

  // Pay-first flow: submit unlocks only after successful payment verification.
  submitBtn.disabled = true;

  // Handle form submission via JS
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitApplication();
  });

  // Show duration modal for Full Stack and Data & Intelligence tracks
  if (domainSelect) {
    domainSelect.addEventListener("change", (e) => {
      const selectedValue = String(e.target.value || "");
      const isFullStackOrData =
        selectedValue.includes("Full Stack") ||
        selectedValue.includes("Data Science") ||
        selectedValue.includes("Data Analytics") ||
        selectedValue.includes("AI/ML") ||
        selectedValue.includes("Analytics Engineering");

      if (isFullStackOrData) {
        // Prefer dedicated modal helper; fallback keeps popup functional.
        if (typeof showDurationModal === "function") {
          showDurationModal();
        } else {
          const modal = document.getElementById("duration-modal");
          if (modal) {
            modal.classList.add("is-open");
            modal.setAttribute("aria-hidden", "false");
          }
        }
      }
    });
  }

  // Attach payment button click handler
  if (payBtn) {
    payBtn.classList.add("visible");
    payBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      initiatePayment();
      return false;
    });
    
    // Prevent any accidental navigation
    payBtn.setAttribute("onclick", "return false;");
    payBtn.style.cursor = "pointer";
  } else {
    console.error("Payment button not found in DOM");
  }

  // Load Razorpay SDK
  loadRazorpaySDK();
});

/**
 * Load Razorpay JavaScript SDK
 */
function loadRazorpaySDK() {
  const script = document.createElement("script");
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.onerror = () => {
    console.error("Failed to load Razorpay SDK");
  };
  document.head.appendChild(script);
}

/**
 * Validate form and extract data
 */
function getFormData() {
  const form = document.querySelector(".apply-form");
  const formData = new FormData(form);

  return {
    full_name: formData.get("full_name"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    linkedin_url: formData.get("linkedin_url"), // ✅ MUST ADD
    college_name: formData.get("college_name"),
    college_location: formData.get("college_location"),
    preferred_domain: formData.get("preferred_domain"),
    languages: formData.get("languages"),
    resume_link: formData.get("resume_link"),
    remote_comfort: formData.get("remote_comfort"),
    placement_contact: formData.get("placement_contact"),
    consent: formData.get("consent"),
  };
}

function setupResumeHelpModal() {
  const modal = document.getElementById("resume-help-modal");
  if (!modal) return;

  const dialog = modal.querySelector(".resume-help-dialog");
  const openButtons = document.querySelectorAll("[data-open-resume-help]");
  const closeButtons = modal.querySelectorAll("[data-close-resume-help]");

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    dialog?.focus();
  };

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  openButtons.forEach((button) => {
    button.addEventListener("click", openModal);
  });

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
}

function setFormStatus(statusEl, message, tone = "info") {
  if (!statusEl) return;

  const toneClasses = ["is-info", "is-success", "is-warning", "is-error", "is-animated"];
  statusEl.classList.remove(...toneClasses);
  statusEl.textContent = message;
  statusEl.classList.add(`is-${tone}`, "is-animated");
}

/**
 * Create application record and return backend response.
 */
async function createApplicationRecord(form) {
  const formData = new FormData(form);
  const response = await apiFetch("/applications", {
    method: "POST",
    body: formData,
  });

  const result = await readJsonResponse(response, "Application request failed");
  if (!response.ok) {
    throw new Error(result.message || "Submission failed");
  }

  return result;
}

/**
 * Submit application form to backend
 */
async function submitApplication() {
  const statusEl = document.querySelector(".form-status");
  const submitBtn = document.querySelector(".apply-form button[type='submit']");
  const payBtn = document.getElementById("pay-registration-fee-btn");

  try {
    if (!isPaymentConfirmed) {
      setFormStatus(statusEl, "Please complete payment first to enable submission.", "warning");
      return;
    }

    setFormStatus(statusEl, "Finalizing your application...", "info");
    submitBtn.disabled = true;

    const form = document.querySelector(".apply-form");
    form?.reset();
    applicationData = {};
    isPaymentConfirmed = false;

    if (payBtn) {
      payBtn.disabled = false;
      payBtn.textContent = "Pay Registration Fee";
    }

    submitBtn.disabled = true;
    setFormStatus(statusEl, "Application submitted successfully. Confirmation has been recorded.", "success");
  } catch (error) {
    setFormStatus(statusEl, `Error: ${error.message}`, "error");
    console.error(error);
  }
}

/**
 * Initiate Razorpay payment
 */
async function initiatePayment() {
  const statusEl = document.querySelector(".form-status");
  const payBtn = document.getElementById("pay-registration-fee-btn");
  const form = document.querySelector(".apply-form");
  const formData = new FormData(form);

  try {
    setFormStatus(statusEl, "Preparing payment...", "info");
    payBtn.disabled = true;

    // Ensure valid form and create application record before payment order.
    if (!form?.reportValidity()) {
      throw new Error("Please complete all required fields before payment");
    }

    let applicationId = applicationData?.applicationId;
    if (!applicationId) {
      setFormStatus(statusEl, "Saving your application details...", "info");
      applicationData = await createApplicationRecord(form);
      applicationId = applicationData?.applicationId;
      if (!applicationId) {
        throw new Error("Unable to initialize application for payment");
      }
    }

    const configuredAmount = parseInt(document.getElementById("internship_price")?.value || "0", 10);
    const amountToPay = Number.isFinite(configuredAmount) && configuredAmount > 0
      ? configuredAmount
      : APPLICATION_FEE;

    // Create Razorpay order on backend
    const orderResponse = await apiFetch("/payments/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId,
        amount: amountToPay,
      }),
    });

    const orderData = await readJsonResponse(orderResponse, "Payment order request failed");

    if (!orderResponse.ok) {
      throw new Error(orderData.message || "Failed to create payment order");
    }

    // Configure Razorpay checkout
    const options = {
      key: RAZORPAY_KEY,
      amount: orderData.amount, // Amount in paise
      currency: orderData.currency,
      name: "Vyntyra Internship",
      description: "Registration Fee - Summer Internship 2026",
      order_id: orderData.orderId,
      prefill: {
        name: formData.get("full_name"),
        email: formData.get("email"),
        contact: formData.get("phone"),
      },
      theme: {
        color: "#0c1425",
      },
      handler: (response) => {
        verifyPayment(response, applicationId);
      },
      modal: {
        ondismiss: () => {
          setFormStatus(statusEl, "Payment cancelled. Please try again.", "warning");
          payBtn.disabled = false;
        },
      },
    };

    // Open Razorpay checkout
    if (!window.Razorpay) {
  throw new Error("Razorpay SDK not loaded. Please refresh page.");
}

const razorpay = new window.Razorpay(options);
    razorpay.open();
  } catch (error) {
    const message = error instanceof TypeError
      ? "Payment Error: Unable to reach payment server. Please retry in a few seconds."
      : /HTML page instead of API JSON|non-JSON response|Invalid JSON response/i.test(String(error?.message || ""))
        ? "Payment Error: API endpoint misconfigured. Please ensure the Render backend /api/payments routes are reachable."
        : `Payment Error: ${error.message}`;
    setFormStatus(statusEl, message, "error");
    console.error(error);
    payBtn.disabled = false;
  }
}

/**
 * Verify payment with backend
 */
async function verifyPayment(paymentResponse, applicationId) {
  const statusEl = document.querySelector(".form-status");
  const payBtn = document.getElementById("pay-registration-fee-btn");
  const submitBtn = document.querySelector(".apply-form button[type='submit']");

  try {
    setFormStatus(statusEl, "Verifying payment...", "info");

    const verifyResponse = await apiFetch("/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: paymentResponse.razorpay_order_id,
        razorpayPaymentId: paymentResponse.razorpay_payment_id,
        razorpaySignature: paymentResponse.razorpay_signature,
      }),
    });

    const verifyResult = await readJsonResponse(verifyResponse, "Payment verification request failed");

    if (!verifyResponse.ok) {
      throw new Error(verifyResult.message || "Payment verification failed");
    }

    isPaymentConfirmed = true;
    setFormStatus(statusEl, "Payment confirmed. Click Submit Application to complete.", "success");

    payBtn.disabled = true;
    payBtn.textContent = "Payment Confirmed";
    if (submitBtn) {
      submitBtn.style.display = "";
      submitBtn.disabled = false;
    }

    // Redirect to thank you page or show success modal after 3 seconds
    setTimeout(() => {
      // Optional: Redirect to confirmation page
      // window.location.href = '/thank-you.html';
    }, 3000);
  } catch (error) {
    setFormStatus(statusEl, `Verification failed: ${error.message}. Please contact support.`, "error");
    console.error(error);
    payBtn.disabled = false;
  }
}

/**
 * Handle form navigation (collapsible sections)
 */
function setupFormNavigation() {
  const tabs = document.querySelectorAll(".legal-tab");
  const policyCards = document.querySelectorAll(".policy-card");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-policy-target");

      // Remove active class from all tabs and cards
      tabs.forEach((t) => t.classList.remove("is-active"));
      policyCards.forEach((card) => card.classList.remove("is-active"));

      // Add active class to clicked tab and corresponding card
      tab.classList.add("is-active");
      document.getElementById(target)?.classList.add("is-active");
    });
  });
}

// Call on DOM ready
document.addEventListener("DOMContentLoaded", setupFormNavigation);
document.addEventListener("DOMContentLoaded", setupResumeHelpModal);
