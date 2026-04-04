/**
 * Duration & Pricing Modal Handler
 * Manages duration selection, add-on selection, and pricing calculation
 */

let selectedDuration = null;
let selectedAddons = [];

/**
 * Show the duration modal when user selects Full Stack or Data Intelligence
 */
function showDurationModal() {
  const modal = document.getElementById("duration-modal");
  if (modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }
}

/**
 * Close the duration modal
 */
function closeDurationModal() {
  const modal = document.getElementById("duration-modal");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
}

/**
 * Initialize all duration modal event handlers
 */
function initializeDurationModal() {
  const modal = document.getElementById("duration-modal");
  const closeButtons = document.querySelectorAll('[data-close-duration]');
  const durationOptions = document.querySelectorAll('input[name="duration"]');
  const addonCheckboxes = document.querySelectorAll('input[name="addon"]');
  const confirmBtn = document.getElementById("confirm-duration-btn");
  const backdrop = document.querySelector(".duration-modal-backdrop");

  // Close modal when clicking backdrop or close buttons
  backdrop?.addEventListener("click", closeDurationModal);
  closeButtons.forEach((btn) => {
    btn.addEventListener("click", closeDurationModal);
  });

  // Update price when duration changes
  durationOptions.forEach((option) => {
    option.addEventListener("change", () => {
      selectedDuration = option.value;
      updatePricing();
    });
  });

  // Update price when add-ons are selected
  addonCheckboxes.forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      selectedAddons = Array.from(addonCheckboxes)
        .filter((cb) => cb.checked)
        .map((cb) => cb.value);
      updatePricing();
    });
  });

  // Confirm button handler
  if (confirmBtn) {
    confirmBtn.addEventListener("click", () => {
      if (!selectedDuration) {
        alert("Please select an internship duration");
        return;
      }

      // Update form fields with selected values
      document.getElementById("selected_duration").value = selectedDuration;
      document.getElementById("selected_addons").value = JSON.stringify(selectedAddons);
      
      // Calculate and store pricing
      const pricing = calculatePricing();
      document.getElementById("internship_price").value = pricing.total;

      console.log("✓ Duration selected:", selectedDuration, "months");
      console.log("✓ Add-ons selected:", selectedAddons);
      console.log("✓ Total price:", pricing.total, "INR");

      closeDurationModal();
    });
  }
}

/**
 * Calculate pricing based on selected duration and add-ons
 */
function calculatePricing() {
  const durationPrices = {
    "1.5": 1999,
    "2": 2999,
    "3": 3999,
  };

  const basePrice = durationPrices[selectedDuration] || 0;
  const addonCheckboxes = Array.from(document.querySelectorAll('input[name="addon"]:checked'));
  const addonsPrice = addonCheckboxes.reduce((sum, checkbox) => {
    const value = Number(checkbox.getAttribute("data-addon-price") || 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const total = basePrice + addonsPrice;

  return {
    base: basePrice,
    addons: addonsPrice,
    total: total,
  };
}

/**
 * Update pricing display in the modal UI
 */
function updatePricing() {
  const pricing = calculatePricing();

  // Update UI with prices
  document.getElementById("base-price").textContent = `₹${pricing.base.toLocaleString()}`;
  document.getElementById("addons-price").textContent = `₹${pricing.addons.toLocaleString()}`;
  document.getElementById("total-price").textContent = `₹${pricing.total.toLocaleString()}`;

  // Enable/disable confirm button based on duration selection
  const confirmBtn = document.getElementById("confirm-duration-btn");
  if (confirmBtn) {
    confirmBtn.disabled = !selectedDuration;
  }
}

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", initializeDurationModal);
