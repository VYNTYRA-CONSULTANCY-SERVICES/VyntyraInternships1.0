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

const API_BASE = `${window.location.origin}/api`;
// Live Razorpay public key
const RAZORPAY_KEY = "rzp_live_SVAKT9bXZhJT85";
const PAYMENT_PENDING_APP_KEY = "vyntyra_pending_application_id";
const RAZORPAY_SDK_ID = "razorpay-checkout-sdk";
const CORE_FIXED_PRICE = 199;
const VISITOR_COUNT_REFRESH_MS = 20000;
const VISITOR_TIMESTAMP_REFRESH_MS = 1000;

// Fee amount in INR
const APPLICATION_FEE = 499;

let applicationData = {};
let isPaymentConfirmed = false;
let razorpaySdkPromise;
let paymentInfraWarmed = false;
let paymentSessionPromise;
let prefetchedRazorpayOrder;
let prefetchedOrderAmount;
let lastVisitorUpdatedAtMs = null;
let visitorTimestampTimerId = null;

const CORE_PROGRAMMING_DOMAINS = new Set(["C++", "JAVA", "PYTHON", "JAVASCRIPT", "DATABASE"]);

// Keep backend alive by pinging every 5 minutes (prevents Render cold start)
function startKeepAliveTimer() {
  setInterval(async () => {
    try {
      await fetch(`${API_BASE.replace('/api', '')}/keep-alive`, { method: 'GET' }).catch(() => {});
    } catch (error) {
      // Silently fail - this is just for keep-alive
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Initialize keep-alive on page load
document.addEventListener('DOMContentLoaded', startKeepAliveTimer, { once: true });

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

function getBackendOrigin() {
  return API_BASE.replace(/\/api\/?$/, "");
}

function warmPaymentInfrastructure() {
  if (paymentInfraWarmed) {
    return;
  }
  paymentInfraWarmed = true;

  loadRazorpaySDK().catch(() => {
    // Silent: primary flow handles SDK load errors during payment.
  });

  fetch(`${getBackendOrigin()}/keep-alive`, {
    method: "GET",
    cache: "no-store",
    keepalive: true,
  }).catch(() => {
    // Silent: this is only a warm-up ping.
  });
}

function resetPaymentSessionPrefetch() {
  paymentSessionPromise = undefined;
  prefetchedRazorpayOrder = undefined;
  prefetchedOrderAmount = undefined;
}

function resolveCurrentAmountToPay() {
  const configuredAmount = parseInt(document.getElementById("internship_price")?.value || "0", 10);
  return Number.isFinite(configuredAmount) && configuredAmount > 0
    ? configuredAmount
    : APPLICATION_FEE;
}

async function preparePaymentSession({ prefetchRazorpayOrder = false } = {}) {
  if (paymentSessionPromise) {
    const existing = await paymentSessionPromise;
    if (!prefetchRazorpayOrder || existing.orderData) {
      return existing;
    }
  }

  const form = document.querySelector(".apply-form");
  if (!form) {
    throw new Error("Application form is not available");
  }

  paymentSessionPromise = (async () => {
    let applicationId = applicationData?.applicationId;
    if (!applicationId) {
      applicationData = await createApplicationRecord(form);
      applicationId = applicationData?.applicationId;
      if (!applicationId) {
        throw new Error("Unable to initialize application for payment");
      }
    }

    const amountToPay = resolveCurrentAmountToPay();

    if (prefetchRazorpayOrder && (!prefetchedRazorpayOrder || prefetchedOrderAmount !== amountToPay)) {
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

      prefetchedRazorpayOrder = orderData;
      prefetchedOrderAmount = amountToPay;
    }

    return {
      applicationId,
      amountToPay,
      orderData: prefetchedRazorpayOrder,
    };
  })();

  try {
    return await paymentSessionPromise;
  } catch (error) {
    resetPaymentSessionPrefetch();
    throw error;
  }
}

function setResumeInputMode(mode) {
  const linkWrap = document.getElementById("resume-link-input-wrap");
  const fileWrap = document.getElementById("resume-file-input-wrap");
  const linkInput = document.getElementById("resume_link");
  const fileInput = document.getElementById("resume_file");
  const fileError = document.getElementById("resume-file-error");

  if (!linkWrap || !fileWrap || !linkInput || !fileInput) {
    return;
  }

  const useUpload = String(mode || "link") === "upload";

  linkWrap.classList.toggle("is-hidden", useUpload);
  linkWrap.setAttribute("aria-hidden", useUpload ? "true" : "false");
  fileWrap.classList.toggle("is-hidden", !useUpload);
  fileWrap.setAttribute("aria-hidden", !useUpload ? "true" : "false");

  linkInput.required = !useUpload;
  fileInput.required = useUpload;

  if (useUpload) {
    linkInput.value = "";
  } else {
    fileInput.value = "";
    if (fileError) {
      fileError.textContent = "";
    }
  }
}

function validateResumeFileSelection() {
  const fileInput = document.getElementById("resume_file");
  const fileError = document.getElementById("resume-file-error");
  if (!fileInput || !fileError) {
    return;
  }

  const selected = fileInput.files && fileInput.files[0];
  if (!selected) {
    fileError.textContent = "";
    return;
  }

  const hasPdfMime = String(selected.type || "").toLowerCase() === "application/pdf";
  const hasPdfExt = String(selected.name || "").toLowerCase().endsWith(".pdf");
  const isPdf = hasPdfMime || hasPdfExt;

  if (!isPdf) {
    fileInput.value = "";
    fileError.textContent = "Please upload a PDF file only.";
    return;
  }

  fileError.textContent = "";
}

function setupResumeInputMode() {
  const modeSelect = document.getElementById("resume_mode");
  const fileInput = document.getElementById("resume_file");
  if (!modeSelect) {
    return;
  }

  setResumeInputMode(modeSelect.value);
  modeSelect.addEventListener("change", (event) => {
    setResumeInputMode(event.target.value);
  });

  if (fileInput) {
    fileInput.addEventListener("change", validateResumeFileSelection);
  }
}

function formatVisitorCount(count) {
  if (!Number.isFinite(count) || count < 0) {
    return "--";
  }
  return Math.floor(count).toLocaleString("en-IN");
}

function animateVisitorCountUpdate(counterEl, nextValue) {
  if (!counterEl) {
    return;
  }

  const currentValue = String(counterEl.textContent || "").trim();
  if (currentValue === nextValue) {
    return;
  }

  counterEl.classList.add("is-updating");
  window.setTimeout(() => {
    counterEl.textContent = nextValue;
    counterEl.classList.remove("is-updating");
  }, 140);
}

function formatUpdatedAtLabel(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return "Updating...";
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (elapsedSeconds < 5) {
    return "Updated just now";
  }
  if (elapsedSeconds < 60) {
    return `Updated ${elapsedSeconds}s ago`;
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `Updated ${elapsedMinutes}m ago`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `Updated ${elapsedHours}h ago`;
}

function updateVisitorTimestamp(updatedAtEl) {
  if (!updatedAtEl) {
    return;
  }

  lastVisitorUpdatedAtMs = Date.now();
  updatedAtEl.classList.add("is-refreshing");
  updatedAtEl.textContent = formatUpdatedAtLabel(lastVisitorUpdatedAtMs);
  window.setTimeout(() => {
    updatedAtEl.classList.remove("is-refreshing");
  }, 360);
}

function startVisitorTimestampTicker(updatedAtEl) {
  if (!updatedAtEl || visitorTimestampTimerId) {
    return;
  }

  visitorTimestampTimerId = window.setInterval(() => {
    updatedAtEl.textContent = formatUpdatedAtLabel(lastVisitorUpdatedAtMs);
  }, VISITOR_TIMESTAMP_REFRESH_MS);
}

async function updateVisitorCountTotal() {
  const visitorCountEl = document.getElementById("visitor-count");
  const updatedAtEl = document.getElementById("visitor-count-updated");
  if (!visitorCountEl) return;

  try {
    const response = await apiFetch("/metrics/visitors", { method: "GET" });
    if (!response.ok) return;

    const payload = await readJsonResponse(response, "Unable to load total visitor count");
    const nextValue = formatVisitorCount(Number(payload.count));
    animateVisitorCountUpdate(visitorCountEl, nextValue);
    updateVisitorTimestamp(updatedAtEl);
  } catch (error) {
    // Leave counter unchanged on transient network failures.
  }
}

async function registerVisitorHit() {
  try {
    const currentUrl = new URL(window.location.href);
    const utmSource = currentUrl.searchParams.get("utm_source") || currentUrl.searchParams.get("source") || "";
    const response = await apiFetch("/metrics/visitors/hit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userAgent: navigator.userAgent,
        referrer: document.referrer || "",
        landingUrl: window.location.href,
        utmSource,
      }),
    });
    if (!response.ok) {
      return;
    }

    const payload = await readJsonResponse(response, "Unable to register visitor hit");
    const visitorCountEl = document.getElementById("visitor-count");
    const updatedAtEl = document.getElementById("visitor-count-updated");
    const nextValue = formatVisitorCount(Number(payload.count));
    animateVisitorCountUpdate(visitorCountEl, nextValue);
    updateVisitorTimestamp(updatedAtEl);
  } catch (error) {
    // Fall back to read-only refresh when hit tracking fails.
    await updateVisitorCountTotal();
  }
}

function setupVisitorCounter() {
  const visitorCountEl = document.getElementById("visitor-count");
  const updatedAtEl = document.getElementById("visitor-count-updated");
  if (!visitorCountEl) return;

  startVisitorTimestampTicker(updatedAtEl);
  registerVisitorHit();
  setInterval(updateVisitorCountTotal, VISITOR_COUNT_REFRESH_MS);
}

function scheduleAfterPaint(callback) {
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => {
      window.setTimeout(callback, 0);
    });
    return;
  }
  window.setTimeout(callback, 0);
}

function setupSiteChatbot() {
  const launchBtn = document.getElementById("chatbot-launch");
  const panel = document.getElementById("chatbot-panel");
  const closeBtn = document.getElementById("chatbot-close");
  const messagesEl = document.getElementById("chatbot-messages");
  const form = document.getElementById("chatbot-form");
  const input = document.getElementById("chatbot-input");
  const voiceBtn = document.getElementById("chatbot-voice");
  const quickButtons = document.querySelectorAll(".chatbot-chip");

  if (!launchBtn || !panel || !messagesEl || !form || !input) {
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = SpeechRecognition ? new SpeechRecognition() : null;
  let voiceOutputEnabled = true;
  let selectedVoice = null;

  const normalizeText = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9+\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const preferredVoiceNames = [
    "Microsoft Neerja",
    "Microsoft Heera",
    "Google UK English Female",
    "Google UK English Male",
    "Google US English",
    "Samantha",
  ];

  const pickBestVoice = (voices) => {
    if (!Array.isArray(voices) || !voices.length) {
      return null;
    }

    for (const preferred of preferredVoiceNames) {
      const exact = voices.find((voice) => String(voice.name || "") === preferred);
      if (exact) {
        return exact;
      }

      const contains = voices.find((voice) => String(voice.name || "").includes(preferred));
      if (contains) {
        return contains;
      }
    }

    return (
      voices.find((voice) => /^en[-_](IN|GB|US)$/i.test(String(voice.lang || ""))) ||
      voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("en")) ||
      voices[0]
    );
  };

  const refreshSelectedVoice = () => {
    if (!("speechSynthesis" in window)) {
      selectedVoice = null;
      return;
    }
    selectedVoice = pickBestVoice(window.speechSynthesis.getVoices());
  };

  const cycleVoice = () => {
    if (!("speechSynthesis" in window)) {
      return null;
    }

    const allVoices = window.speechSynthesis
      .getVoices()
      .filter((voice) => String(voice.lang || "").toLowerCase().startsWith("en"));

    if (!allVoices.length) {
      return null;
    }

    if (!selectedVoice) {
      selectedVoice = allVoices[0];
      return selectedVoice;
    }

    const currentIndex = allVoices.findIndex((voice) => voice.name === selectedVoice.name);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % allVoices.length : 0;
    selectedVoice = allVoices[nextIndex];
    return selectedVoice;
  };

  if ("speechSynthesis" in window) {
    refreshSelectedVoice();
    window.speechSynthesis.addEventListener("voiceschanged", refreshSelectedVoice);
  }

  if (recognition) {
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || "").trim();
      if (!transcript) return;
      input.value = transcript;
      processQuery(transcript);
    };

    recognition.onend = () => {
      voiceBtn?.classList.remove("is-listening");
      voiceBtn && (voiceBtn.textContent = voiceOutputEnabled ? "Mic" : "Mic Off");
    };
  } else if (voiceBtn) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = "No Mic";
  }

  const speak = (text) => {
    if (!voiceOutputEnabled || !("speechSynthesis" in window) || !text) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.rate = 0.94;
    utterance.pitch = 0.95;
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang || utterance.lang;
    }
    window.speechSynthesis.speak(utterance);
  };

  const appendMessage = (text, role = "bot") => {
    const item = document.createElement("p");
    item.className = `chatbot-msg ${role}`;
    item.innerHTML = text;
    messagesEl.appendChild(item);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  const getReply = (query) => {
    const q = normalizeText(query);

    if (/\b(change|switch|update)\b.*\bvoice\b|\bvoice\b.*\b(change|switch|update)\b/.test(q)) {
      const nextVoice = cycleVoice();
      if (!nextVoice) {
        return {
          text: "I could not find another English voice on this browser. You can still use text replies.",
          speech: "I could not find another English voice on this browser.",
        };
      }
      return {
        text: `Voice changed to <strong>${nextVoice.name}</strong>.`,
        speech: `Voice changed to ${nextVoice.name}.`,
      };
    }

    if (/\b(apply|application|register|enroll)\b/.test(q)) {
      return {
        text: "You can apply from the Application Form section. <a href='#apply'>Go to Apply</a>",
        speech: "You can apply from the Application Form section. I can take you there now.",
      };
    }

    if (/\b(price|fee|fees|cost|payment)\b/.test(q)) {
      return {
        text: "Program fee options are ₹1,999 for 1.5 months, ₹2,999 for 2 months, and ₹3,999 for 3 months. Core Programming track is fixed at ₹199.",
        speech: "Program fee options are 1,999 rupees for one and a half months, 2,999 rupees for two months, and 3,999 rupees for three months. Core programming track is fixed at 199 rupees.",
      };
    }

    if (/\b(track|domain|course|speciali[sz]ation)\b/.test(q)) {
      return {
        text: "Domains include Full Stack Development, Data & Intelligence, Infrastructure & Ops, Core Engineering, Design & Creative, and Management. <a href='#tracks'>View Tracks</a>",
        speech: "Domains include full stack development, data and intelligence, infrastructure and operations, core engineering, design and creative, and management.",
      };
    }

    if (/\b(deadline|close|last date|last day)\b/.test(q)) {
      return {
        text: "Applications for the first intake level close on 15th April 2026.",
        speech: "Applications for the first intake level close on fifteenth April 2026.",
      };
    }

    if (/\b(contact|phone|email|support|help line|helpline)\b/.test(q)) {
      return {
        text: "Support: support@vyntyraconsultancyservices.in, Internships: internships@vyntyraconsultancyservices.in, Phone: +91 93905 15106.",
        speech: "Support email is support at vyntyraconsultancyservices dot in. Internship email is internships at vyntyraconsultancyservices dot in. Phone number is plus 91 93905 15106.",
      };
    }

    if (/\b(journey|timeline|duration|weeks|phase)\b/.test(q)) {
      return {
        text: "Internship journey is 13 weeks: Foundation (4 weeks), Implementation (6 weeks), and Career Launch (3 weeks). <a href='#journey'>View Journey</a>",
        speech: "Internship journey is 13 weeks with foundation, implementation, and career launch phases.",
      };
    }

    if (/\b(eligible|eligibility|who can apply|intake|batch)\b/.test(q)) {
      return {
        text: "Eligibility targets pre-final and final year students from 2027 and 2028 graduating batches, with focus on Tier 2 and Tier 3 colleges.",
        speech: "Eligibility targets pre-final and final year students from 2027 and 2028 graduating batches, with focus on tier 2 and tier 3 colleges.",
      };
    }

    return {
      text: "I answer only verified details from this page to keep responses accurate. Try: fees, tracks, eligibility, deadline, contact, or apply.",
      speech: "I answer verified details from this page. Ask me about fees, tracks, eligibility, deadline, contact, or apply.",
    };
  };

  const processQuery = (query) => {
    const cleaned = String(query || "").trim();
    if (!cleaned) return;

    appendMessage(cleaned, "user");
    const reply = getReply(cleaned);
    window.setTimeout(() => {
      appendMessage(reply.text, "bot");
      speak(reply.speech || reply.text.replace(/<[^>]*>/g, " "));
    }, 220);
  };

  const openPanel = () => {
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    launchBtn.setAttribute("aria-expanded", "true");
    if (!messagesEl.children.length) {
      appendMessage("Hello, I am Vyntyra Assistant. Ask me anything about tracks, fees, deadlines, or application.", "bot");
    }
    input.focus();
  };

  const closePanel = () => {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    launchBtn.setAttribute("aria-expanded", "false");
  };

  launchBtn.addEventListener("click", () => {
    if (panel.classList.contains("is-open")) {
      closePanel();
      return;
    }
    openPanel();
  });

  closeBtn?.addEventListener("click", closePanel);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    scheduleAfterPaint(() => {
      processQuery(input.value);
    });
    input.value = "";
  });

  quickButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const query = button.getAttribute("data-chatbot-query") || "";
      scheduleAfterPaint(() => {
        processQuery(query);
      });
    });
  });

  voiceBtn?.addEventListener("click", () => {
    if (!recognition) {
      return;
    }
    if (voiceBtn.classList.contains("is-listening")) {
      recognition.stop();
      return;
    }
    voiceBtn.classList.add("is-listening");
    voiceBtn.textContent = "Listening";
    recognition.start();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panel.classList.contains("is-open")) {
      closePanel();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupSiteChatbot();

  const form = document.querySelector(".apply-form");
  const payBtn = document.getElementById("pay-registration-fee-btn");
  const submitBtn = form?.querySelector('button[type="submit"]');
  const domainSelect = form?.querySelector('select[name="preferred_domain"]');
  const paymentGatewayModal = document.getElementById("payment-gateway-modal");
  const durationPricingSection = document.getElementById("duration-pricing-section");
  const domainSubtitle = document.getElementById("domain-pricing-subtitle");
  const durationSubsection = document.querySelector(".duration-subsection");
  const durationSelect = document.getElementById("internship_duration");
  const addonsSubsection = document.querySelector(".addons-subsection");
  const addonCheckboxes = document.querySelectorAll('input[name="addon"]');
  const defaultDurationMarkup = durationSelect?.innerHTML || "";

  if (!form || !payBtn || !submitBtn) {
    console.error("Application form controls not found in DOM");
    return;
  }

  // Pay-first flow: submit unlocks only after successful payment verification.
  submitBtn.disabled = true;

  handlePayURedirectState();
  setupPaymentGatewayModal(paymentGatewayModal);
  setupResumeInputMode();
  setupVisitorCounter();

  // Handle form submission via JS
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitApplication();
  });

  const invalidatePrefetch = () => {
    if (!isPaymentConfirmed) {
      resetPaymentSessionPrefetch();
    }
  };

  let inputInvalidateRafId = null;
  const scheduleInvalidatePrefetch = () => {
    if (isPaymentConfirmed || inputInvalidateRafId !== null) {
      return;
    }

    inputInvalidateRafId = window.requestAnimationFrame(() => {
      inputInvalidateRafId = null;
      resetPaymentSessionPrefetch();
    });
  };

  form.addEventListener("input", scheduleInvalidatePrefetch, true);
  form.addEventListener("change", invalidatePrefetch, true);

  function applyDomainPricingState(selectedValue) {
    const hasDomainSelection = Boolean(selectedValue);

    if (!durationPricingSection) {
      return;
    }

    durationPricingSection.classList.toggle("is-visible", hasDomainSelection);
    durationPricingSection.style.display = hasDomainSelection ? "block" : "none";

    if (!hasDomainSelection) {
      if (domainSubtitle) {
        domainSubtitle.textContent = "";
      }
      if (durationSubsection) {
        durationSubsection.classList.remove("is-hidden");
        durationSubsection.setAttribute("aria-hidden", "false");
      }
      if (durationSelect) {
        if (!durationSelect.querySelector('option[value="1.5"]')) {
          durationSelect.innerHTML = defaultDurationMarkup;
        }
        durationSelect.disabled = false;
        durationSelect.value = "2";
      }
      if (addonsSubsection) {
        addonsSubsection.classList.remove("is-hidden");
        addonsSubsection.setAttribute("aria-hidden", "false");
      }
      addonCheckboxes.forEach((checkbox) => {
        checkbox.disabled = false;
        checkbox.checked = false;
      });
      updatePriceSummary();
      return;
    }

    if (domainSubtitle) {
      domainSubtitle.textContent = `Selected: ${selectedValue}`;
    }

    const isCoreProgrammingDomain = CORE_PROGRAMMING_DOMAINS.has(selectedValue);

    if (durationSelect) {
      if (isCoreProgrammingDomain) {
        durationSelect.innerHTML = '<option value="fixed-core" data-price="199" selected>Core Programming Track - ₹199 (Fixed)</option>';
        durationSelect.disabled = true;
      } else {
        if (!durationSelect.querySelector('option[value="1.5"]')) {
          durationSelect.innerHTML = defaultDurationMarkup;
        }
        durationSelect.disabled = false;
        durationSelect.value = "2";
      }
    }

    // Keep duration and add-ons visible and enabled for all domains.
    if (durationSubsection) {
      durationSubsection.classList.remove("is-hidden");
      durationSubsection.setAttribute("aria-hidden", "false");
    }

    if (addonsSubsection) {
      addonsSubsection.classList.remove("is-hidden");
      addonsSubsection.setAttribute("aria-hidden", "false");
    }

    addonCheckboxes.forEach((checkbox) => {
      checkbox.checked = false;
      checkbox.disabled = false;
    });

    updatePriceSummary();
  }

  // Show duration & pricing section for all tracks after domain selection.
  if (domainSelect) {
    domainSelect.addEventListener("change", (e) => {
      const selectedValue = String(e.target.value || "").trim();
      applyDomainPricingState(selectedValue);
    });

    applyDomainPricingState(String(domainSelect.value || "").trim());
  }

  // Attach payment button click handler
  if (payBtn) {
    payBtn.classList.add("visible");
    payBtn.addEventListener("mouseenter", warmPaymentInfrastructure, { once: true });
    payBtn.addEventListener("focus", warmPaymentInfrastructure, { once: true });
    payBtn.addEventListener("touchstart", warmPaymentInfrastructure, { once: true, passive: true });
    payBtn.addEventListener("click", (e) => {
      const currentScrollY = window.scrollY;
      e.preventDefault();
      e.stopPropagation();
      openPaymentGatewayModal();
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: currentScrollY, left: 0, behavior: "auto" });
      });
      return false;
    });
    
    // Prevent any accidental navigation
    payBtn.setAttribute("onclick", "return false;");
    payBtn.style.cursor = "pointer";
  } else {
    console.error("Payment button not found in DOM");
  }

  // Setup duration and add-ons price updates
  durationSelect?.addEventListener("change", updatePriceSummary);
  
  addonCheckboxes.forEach(checkbox => {
    checkbox.addEventListener("change", updatePriceSummary);
  });

  // Load Razorpay SDK
  loadRazorpaySDK();

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(warmPaymentInfrastructure, { timeout: 1500 });
  } else {
    setTimeout(warmPaymentInfrastructure, 1200);
  }
});

/**
 * Load Razorpay JavaScript SDK
 */
function loadRazorpaySDK() {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  if (razorpaySdkPromise) {
    return razorpaySdkPromise;
  }

  const existingScript = document.getElementById(RAZORPAY_SDK_ID);
  if (existingScript) {
    razorpaySdkPromise = new Promise((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Razorpay SDK")), { once: true });
      if (window.Razorpay) {
        resolve();
      }
    });
    return razorpaySdkPromise;
  }

  const script = document.createElement("script");
  script.id = RAZORPAY_SDK_ID;
  script.src = "https://checkout.razorpay.com/v1/checkout.js";
  script.async = true;

  razorpaySdkPromise = new Promise((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => {
      razorpaySdkPromise = undefined;
      reject(new Error("Failed to load Razorpay SDK"));
    };
  });

  document.head.appendChild(script);
  return razorpaySdkPromise;
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

function setupRegistrationSuccessModal() {
  const modal = document.getElementById("registration-success-modal");
  if (!modal) return;

  const closeButtons = modal.querySelectorAll("[data-close-registration-success]");

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
}

function showRegistrationSuccessDetails(details) {
  const modal = document.getElementById("registration-success-modal");
  if (!modal) return;

  const greetingEl = document.getElementById("registration-success-greeting");
  const registrationIdEl = document.getElementById("registration-success-id");
  const paymentGatewayEl = document.getElementById("registration-success-payment-gateway");
  const paymentAmountEl = document.getElementById("registration-success-payment-amount");
  const paymentTransactionEl = document.getElementById("registration-success-transaction-id");
  const paymentStatusEl = document.getElementById("registration-success-payment-status");
  const paymentTimeEl = document.getElementById("registration-success-payment-time");

  const applicantName = String(details?.applicantName || "Applicant").trim() || "Applicant";
  const registrationId = String(details?.registrationId || "N/A").trim() || "N/A";
  const payment = details?.payment || {};

  const amount = Number(payment?.amount || 0);
  const amountLabel = amount > 0
    ? `${String(payment?.currency || "INR").toUpperCase()} ${amount.toLocaleString("en-IN")}`
    : "N/A";
  const transactionId = String(payment?.transactionId || payment?.orderId || "N/A").trim() || "N/A";
  const paymentTimestamp = payment?.timestamp ? new Date(payment.timestamp) : null;
  const paymentTimeLabel = paymentTimestamp && !Number.isNaN(paymentTimestamp.getTime())
    ? paymentTimestamp.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
    : "N/A";

  if (greetingEl) greetingEl.textContent = `Hi ${applicantName}, your application has been submitted successfully.`;
  if (registrationIdEl) registrationIdEl.textContent = registrationId;
  if (paymentGatewayEl) paymentGatewayEl.textContent = String(payment?.gateway || "N/A").toUpperCase();
  if (paymentAmountEl) paymentAmountEl.textContent = amountLabel;
  if (paymentTransactionEl) paymentTransactionEl.textContent = transactionId;
  if (paymentStatusEl) paymentStatusEl.textContent = String(payment?.status || "N/A").toUpperCase();
  if (paymentTimeEl) paymentTimeEl.textContent = paymentTimeLabel;

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector(".resume-help-dialog")?.focus();
}

/**
 * Update price summary based on duration and add-ons selection
 */
function updatePriceSummary() {
  const selectedDomain = String(document.getElementById("preferred_domain")?.value || "").trim();
  const isCoreProgrammingDomain = CORE_PROGRAMMING_DOMAINS.has(selectedDomain);
  const durationSelect = document.getElementById("internship_duration");
  const selectedDurationOption = durationSelect?.selectedOptions?.[0] || null;
  const addonCheckboxes = document.querySelectorAll('input[name="addon"]:checked');
  
  // Base price: fixed ₹199 for core domains, or duration-based for all other domains.
  let basePrice = isCoreProgrammingDomain ? CORE_FIXED_PRICE : 2999;
  if (!isCoreProgrammingDomain && selectedDurationOption) {
    basePrice = parseInt(selectedDurationOption.dataset.price || "2999", 10);
  }
  
  let addonsTotal = 0;
  addonCheckboxes.forEach(checkbox => {
    addonsTotal += parseInt(checkbox.dataset.addonPrice || "0", 10);
  });
  
  const totalPrice = basePrice + addonsTotal;
  
  // Update display elements (inline version)
  const basePriceEl = document.getElementById("base-price-inline");
  const addonsPriceEl = document.getElementById("addons-price-inline");
  const totalPriceEl = document.getElementById("total-price-inline");
  
  if (basePriceEl) basePriceEl.textContent = `₹${basePrice.toLocaleString()}`;
  if (addonsPriceEl) addonsPriceEl.textContent = `₹${addonsTotal.toLocaleString()}`;
  if (totalPriceEl) totalPriceEl.textContent = `₹${totalPrice.toLocaleString()}`;
  
  // Update hidden form fields
  const durationField = document.getElementById("selected_duration");
  const addonsField = document.getElementById("selected_addons");
  const priceField = document.getElementById("internship_price");

  if (durationField) {
    durationField.value = isCoreProgrammingDomain ? "fixed-core" : (durationSelect?.value || "2");
  }
  if (addonsField) {
    const selectedAddons = Array.from(addonCheckboxes).map(cb => cb.value).join(", ");
    addonsField.value = selectedAddons;
  }
  if (priceField) priceField.value = totalPrice;
}

function setFormStatus(statusEl, message, tone = "info") {
  if (!statusEl) return;

  const toneClasses = ["is-info", "is-success", "is-warning", "is-error", "is-animated", "is-celebration"];
  statusEl.classList.remove(...toneClasses);
  statusEl.textContent = message;
  statusEl.classList.add(`is-${tone}`, "is-animated");
}

function showPaymentConfirmationGreeting(gatewayLabel) {
  const statusEl = document.querySelector(".form-status");
  setFormStatus(
    statusEl,
    `Payment confirmed via ${gatewayLabel}. Welcome aboard! Your seat is secured, now click Submit Application to complete onboarding.`,
    "success"
  );

  if (statusEl) {
    statusEl.classList.add("is-celebration");
  }
}

function setPaymentConfirmedState(gatewayLabel, applicationIdFromGateway) {
  const payBtn = document.getElementById("pay-registration-fee-btn");
  const submitBtn = document.querySelector(".apply-form button[type='submit']");
  isPaymentConfirmed = true;

  if (applicationIdFromGateway) {
    applicationData.applicationId = applicationIdFromGateway;
  }

  if (payBtn) {
    payBtn.disabled = true;
    payBtn.textContent = `Payment Confirmed (${gatewayLabel})`;
  }

  if (submitBtn) {
    submitBtn.style.display = "";
    submitBtn.disabled = false;
  }

  showPaymentConfirmationGreeting(gatewayLabel);
}

function setupPaymentGatewayModal(modal) {
  if (!modal) return;

  const closeButtons = modal.querySelectorAll("[data-close-payment-gateway]");
  const optionButtons = modal.querySelectorAll("[data-payment-gateway]");

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  };

  closeButtons.forEach((button) => {
    button.addEventListener("click", closeModal);
  });

  optionButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const selectedGateway = button.getAttribute("data-payment-gateway");
      closeModal();
      await initiatePayment(selectedGateway);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("is-open")) {
      closeModal();
    }
  });
}

function openPaymentGatewayModal() {
  const statusEl = document.querySelector(".form-status");
  const modal = document.getElementById("payment-gateway-modal");
  const form = document.querySelector(".apply-form");
  if (!modal || !form) return;

  if (!form.reportValidity()) {
    setFormStatus(statusEl, "Please complete all required fields before selecting payment gateway.", "warning");
    return;
  }

  setFormStatus(statusEl, "Estimated wait time is 5 min.", "info");

  warmPaymentInfrastructure();
  preparePaymentSession({ prefetchRazorpayOrder: true }).catch(() => {
    // Lazy prefetch: hard failures are handled in the explicit payment flow.
  });

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  modal.querySelector(".payment-gateway-dialog")?.focus();
}

function handlePayURedirectState() {
  const params = new URLSearchParams(window.location.search);
  const paymentStatus = String(params.get("payment") || "").toLowerCase();
  const gateway = String(params.get("gateway") || "").toLowerCase();
  const applicationId = String(params.get("applicationId") || localStorage.getItem(PAYMENT_PENDING_APP_KEY) || "").trim();
  const statusEl = document.querySelector(".form-status");

  if (gateway !== "payu") {
    return;
  }

  if (paymentStatus === "success") {
    setPaymentConfirmedState("PayU", applicationId);
    localStorage.removeItem(PAYMENT_PENDING_APP_KEY);
  } else if (paymentStatus === "failure") {
    setFormStatus(statusEl, "PayU payment was not completed. Please try again.", "warning");
    const payBtn = document.getElementById("pay-registration-fee-btn");
    if (payBtn) payBtn.disabled = false;
    localStorage.removeItem(PAYMENT_PENDING_APP_KEY);
  }

  if (paymentStatus === "success" || paymentStatus === "failure") {
    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  }
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

    const applicationId = String(applicationData?.applicationId || "").trim();
    if (!applicationId) {
      throw new Error("Application reference not found. Please retry payment and submit again.");
    }

    const registrationResponse = await apiFetch(`/applications/${applicationId}/registration`, {
      method: "GET",
    });
    const registrationData = await readJsonResponse(registrationResponse, "Unable to fetch registration details");

    if (!registrationResponse.ok) {
      throw new Error(registrationData.message || "Unable to load registration details");
    }

    showRegistrationSuccessDetails(registrationData);

    const form = document.querySelector(".apply-form");
    form?.reset();
    applicationData = {};
    isPaymentConfirmed = false;
    resetPaymentSessionPrefetch();
    localStorage.removeItem(PAYMENT_PENDING_APP_KEY);

    if (payBtn) {
      payBtn.disabled = false;
      payBtn.textContent = "Pay Registration Fee";
    }

    submitBtn.disabled = true;
    setFormStatus(statusEl, "Application submitted successfully. Registration details are now available.", "success");
  } catch (error) {
    setFormStatus(statusEl, `Error: ${error.message}`, "error");
    console.error(error);
  }
}

/**
 * Initiate Razorpay payment
 */
async function initiatePayment(gateway = "razorpay") {
  const statusEl = document.querySelector(".form-status");
  const payBtn = document.getElementById("pay-registration-fee-btn");
  const form = document.querySelector(".apply-form");
  const formData = new FormData(form);

  try {
    setFormStatus(statusEl, "Preparing payment gateway...", "info");
    payBtn.disabled = true;

    // Ensure valid form and create application record before payment order.
    if (!form?.reportValidity()) {
      throw new Error("Please complete all required fields before payment");
    }

    const normalizedGateway = String(gateway).toLowerCase();
    setFormStatus(statusEl, "Saving your details...", "info");
    const { applicationId, amountToPay, orderData: prefetchedOrder } = await preparePaymentSession({
      prefetchRazorpayOrder: normalizedGateway === "razorpay",
    });

    if (normalizedGateway === "payu") {
      await initiatePayUPayment({ applicationId, amountToPay, formData });
      return;
    }

    let orderData = prefetchedOrder;
    if (!orderData) {
      const orderController = new AbortController();
      const timeoutId = setTimeout(() => orderController.abort(), 15000);
      setFormStatus(statusEl, "Loading payment method...", "info");

      const orderResponse = await apiFetch("/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          amount: amountToPay,
        }),
        signal: orderController.signal,
      });

      clearTimeout(timeoutId);
      orderData = await readJsonResponse(orderResponse, "Payment order request failed");
      if (!orderResponse.ok) {
        throw new Error(orderData.message || "Failed to create payment order");
      }
    }

    setFormStatus(statusEl, "Opening secure payment window...", "info");

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
    resetPaymentSessionPrefetch();
  } catch (error) {
    const message = error instanceof TypeError
      ? "Payment Error: Unable to reach payment server. Please retry in a few seconds."
      : error?.name === 'AbortError'
        ? "Payment Error: Server took too long to respond. Please retry."
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

  try {
    setFormStatus(statusEl, "Confirming your payment...", "info");

    // Add timeout for verification 
    const verifyController = new AbortController();
    const timeoutId = setTimeout(() => verifyController.abort(), 20000); // 20 second timeout

    const verifyResponse = await apiFetch("/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        razorpayOrderId: paymentResponse.razorpay_order_id,
        razorpayPaymentId: paymentResponse.razorpay_payment_id,
        razorpaySignature: paymentResponse.razorpay_signature,
      }),
      signal: verifyController.signal,
    });

    clearTimeout(timeoutId);
    const verifyResult = await readJsonResponse(verifyResponse, "Payment verification request failed");

    if (!verifyResponse.ok) {
      throw new Error(verifyResult.message || "Payment verification failed");
    }

    setPaymentConfirmedState("Razorpay", applicationId);
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? "Verification took too long. Payment may still be processing. Please refresh."
      : `Verification failed: ${error.message}. Please contact support.`;
    setFormStatus(statusEl, message, "error");
    console.error(error);
    payBtn.disabled = false;
  }
}

async function initiatePayUPayment({ applicationId, amountToPay, formData }) {
  const statusEl = document.querySelector(".form-status");
  const payBtn = document.getElementById("pay-registration-fee-btn");

  setFormStatus(statusEl, "Redirecting to PayU secure payment page...", "info");

  const response = await apiFetch("/payments/payu/initiate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      applicationId,
      amount: amountToPay,
      fullName: formData.get("full_name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
    }),
  });

  const payuData = await readJsonResponse(response, "PayU initiation failed");
  if (!response.ok) {
    throw new Error(payuData.message || "Unable to start PayU payment");
  }

  localStorage.setItem(PAYMENT_PENDING_APP_KEY, applicationId);

  const form = document.createElement("form");
  form.method = "POST";
  form.action = payuData.actionUrl;
  form.style.display = "none";

  Object.entries(payuData.fields || {}).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = String(value ?? "");
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();

  if (payBtn) {
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
document.addEventListener("DOMContentLoaded", setupRegistrationSuccessModal);
