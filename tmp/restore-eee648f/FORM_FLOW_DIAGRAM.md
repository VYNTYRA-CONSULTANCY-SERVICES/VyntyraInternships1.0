# Form Flow Visualization

## User Journey - Application Form

```
START: User visits internship application page
  ↓
┌─────────────────────────────────────────────┐
│ STEP 1: Fill Basic Information              │
├─────────────────────────────────────────────┤
│ □ Full Name                                 │
│ □ Phone Number                              │
│ □ Email ID                                  │
│ □ LinkedIn URL                              │
│ □ College Name                              │
│ □ College Location                          │
│ [Select Domain Dropdown ↓]                  │
└─────────────────────────────────────────────┘
  ↓ (User clicks on domain dropdown)
┌─────────────────────────────────────────────┐
│ STEP 2: User Selects Domain                 │
├─────────────────────────────────────────────┤
│ Domain Options:                             │
│ • Full Stack - MERN                         │
│ • Full Stack - Frontend                     │
│ • Full Stack - Backend                      │
│ • Data Science                              │
│ • Data Analytics                            │
│ • AI/ML Engineering                         │
│ • C++ / JAVA / PYTHON / JS                 │
│ • Product / Project Management              │
│ ... (and more)                              │
└─────────────────────────────────────────────┘
  ↓ (Domain selected)
  ↓✨ ANIMATION: Duration section slides down
┌─────────────────────────────────────────────┐
│ STEP 3: Duration & Pricing (NEW!)           │
├─────────────────────────────────────────────┤
│ 📅 Select Your Internship Duration          │
│ Selected: Full Stack - MERN                 │
│                                             │
│ [1.5 Months]  [2 Months ★]  [3 Months]    │
│ ₹1,999        ₹2,999         ₹3,999        │
│              ↑ Most Popular                 │
│                                             │
│ 🎁 Add-ons (Optional)                       │
│ ☐ Workshop Certificate → ₹199              │
│ ☐ Mock Interviews → ₹499                   │
│ ☐ Resume Enhancing → Free                  │
│                                             │
│ ┌─────────────────────────────────────┐   │
│ │ Base Price: ₹2,999                  │   │
│ │ Add-ons:    ₹0                      │   │
│ │ Total:      ₹2,999                  │   │
│ └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ STEP 4: Continue Filling Form               │
├─────────────────────────────────────────────┤
│ □ Communication Languages                   │
│ □ Resume Link (Google Drive)                │
│ □ Remote Comfort (Yes/No)                   │
│ □ College Placement Contact                 │
│ ☑ I consent to T&Cs                        │
│                                             │
│ [Pay Registration Fee]                      │
│ [Submit Application]                        │
└─────────────────────────────────────────────┘
  ↓ (User clicks "Pay Registration Fee")
┌─────────────────────────────────────────────┐
│ STEP 5: Payment Gateway Selection           │
├─────────────────────────────────────────────┤
│ Choose Your Payment Gateway:                │
│ [Razorpay] [PayU]                          │
└─────────────────────────────────────────────┘
  ↓ (User completes payment)
┌─────────────────────────────────────────────┐
│ STEP 6: Submit Application                  │
├─────────────────────────────────────────────┤
│ ✅ Payment Confirmed (Gateway Name)         │
│                                             │
│ [Submit Application]                        │
└─────────────────────────────────────────────┘
  ↓
┌─────────────────────────────────────────────┐
│ ✨ APPLICATION SUBMITTED SUCCESSFULLY ✨     │
│                                             │
│ Seat Secured!                               │
│ Confirmation has been recorded.             │
│ Check your email for next steps.            │
└─────────────────────────────────────────────┘
  ↓
END: User receives confirmation & next steps
```

---

## Pricing Logic Flow

```
User selects duration:
  ├── 1.5 Months → basePrice = 1999
  ├── 2 Months   → basePrice = 2999 ⭐
  └── 3 Months   → basePrice = 3999

User selects add-ons:
  ├── Workshop         →  addonsPrice = 199
  ├── Mock Interviews  →  addonsPrice = 499
  └── Resume Enhancing →  addonsPrice = 0

Calculation:
  totalPrice = basePrice + addonsPrice
  
Display:
  "Base Price: ₹[basePrice]"
  "Add-ons:    ₹[addonsPrice]"
  "━━━━━━━━━━━━━━━━━━━━━━━"
  "Total:      ₹[totalPrice]"
```

---

## Interaction Scenarios

### Scenario 1: User wants basic 2-month program
```
1. Select domain ✓
2. Duration box appears
3. 2 Months already checked (default)
4. No add-ons selected
5. Total = ₹2,999 ✓
6. Click Pay
```

### Scenario 2: User wants full package
```
1. Select domain ✓
2. Duration box appears
3. Click "3 Months"
4. Check "Workshop" (+₹199)
5. Check "Mock Interviews" (+₹499)
6. Check "Resume Enhancing" (+₹0)
7. Total = ₹3,999 + ₹199 + ₹499 + ₹0 = ₹4,697 ✓
8. Click Pay
```

### Scenario 3: User changes mind about duration
```
1. Select domain ✓
2. Select 3 Months
3. Total shows ₹3,999
4. Click "1.5 Months" instead
5. Total instantly updates to ₹1,999 ✓
6. Add some add-ons
7. New total calculated
8. Click Pay
```

### Scenario 4: User deselects domain
```
1. Selected "Data Science"
2. Duration section visible
3. Click domain dropdown
4. Select "---" (clear selection)
5. Duration section hides ✓
6. No price displayed
7. Must re-select domain to continue
```

---

## Responsive Layout Breakdown

### Desktop (1200px+)
```
┌──────────────────────────────────────────────┐
│  Duration & Pricing Section                  │
│  ┌──────────────┬──────────────┬──────────────┐
│  │ 1.5 Months   │ 2 Months ⭐  │ 3 Months     │
│  │ ₹1,999       │ ₹2,999       │ ₹3,999       │
│  └──────────────┴──────────────┴──────────────┘
│  Add-ons Section (full width below)
│  Price Summary (full width below)
└──────────────────────────────────────────────┘
```

### Tablet (800px)
```
┌──────────────────────────────┐
│  Duration & Pricing Section   │
│  ┌──────────────┬──────────────┐
│  │ 1.5 Months   │ 2 Months ⭐  │
│  │ ₹1,999       │ ₹2,999       │
│  └──────────────┴──────────────┘
│  ┌──────────────────────────────┐
│  │ 3 Months                      │
│  │ ₹3,999                        │
│  └──────────────────────────────┘
│  Add-ons Section (full width)
│  Price Summary (full width)
└──────────────────────────────┘
```

### Mobile (< 600px)
```
┌─────────────────┐
│ Duration Box 1  │
│ 1.5 Months      │
│ ₹1,999          │
└─────────────────┘
┌─────────────────┐
│ Duration Box 2  │
│ 2 Months ⭐     │
│ ₹2,999          │
└─────────────────┘
┌─────────────────┐
│ Duration Box 3  │
│ 3 Months        │
│ ₹3,999          │
└─────────────────┘
┌─────────────────┐
│ Add-ons (list)  │
└─────────────────┘
┌─────────────────┐
│ Price Summary   │
└─────────────────┘
```

---

## Files Modified

```
/index.html
  ├─ Added duration-pricing-section after domain select
  ├─ Duration cards with radio buttons
  ├─ Add-ons with checkboxes
  └─ Price display elements

/assets/css/premium-style.css
  ├─ .duration-pricing-section
  ├─ .duration-options-inline
  ├─ .duration-card-inline
  ├─ .addon-option-inline
  ├─ .price-summary-inline
  └─ @keyframes slideDown

/assets/js/application.js
  ├─ Updated domain select listener
  ├─ Added updatePriceSummary() function
  ├─ Added event listeners for duration/add-ons
  └─ Now shows inline section instead of modal
```

---

## State Management

```javascript
// Form Field States
{
  preferred_domain: "Full Stack - MERN",
  selected_duration: "2",        // "1.5", "2", or "3"
  selected_addons: "workshop",   // CSV of selected add-ons
  internship_price: "3198"       // total price as string
}

// Display States
{
  durationPricingVisible: true,  // false when domain not selected
  basePriceDisplay: "₹2,999",
  addonsPriceDisplay: "₹199",
  totalPriceDisplay: "₹3,198"
}
```

---

## Event Flow Diagram

```
Domain Select Event
  ↓
Check if value exists
  ├─ YES: Show duration section
  │   ├─ Set default to 2 months
  │   ├─ Clear add-ons
  │   ├─ Update subtitle with domain name
  │   ├─ Call updatePriceSummary()
  │   └─ Price displays
  │
  └─ NO: Hide duration section
      └─ Price hidden

Duration Radio Change Event
  ↓
Get selected value
  ↓
Call updatePriceSummary()
  ├─ Calculate new basePrice
  ├─ Keep addonsPrice same
  ├─ Calculate totalPrice
  └─ Update all displays

Add-on Checkbox Change Event
  ↓
Get checked values
  ↓
Call updatePriceSummary()
  ├─ Keep basePrice same
  ├─ Calculate new addonsTotal
  ├─ Calculate totalPrice
  └─ Update all displays
```

---

## Color & Styling Guide

```
Duration Section:
  Border:     rgba(123, 225, 255, 0.3)    // Cyan border
  Background: rgba(123, 225, 255, 0.08)   // Subtle cyan
  
Selected Duration:
  Border:     #7be1ff (cyan)               // Bright cyan
  Glow:       rgba(123, 225, 255, 0.25)   // Cyan glow
  
Price Text:
  Color:      #7be1ff (cyan)               // Matches highlight
  Font-size:  1.5rem
  Font-weight: 700 (bold)
  
Popular Badge:
  Background: rgba(255, 201, 75, 0.15)    // Gold
  Color:      #ffc94b (gold)               // Accent color
  Text:       "Most Popular"
```

---

## Accessibility Notes

- ✅ Duration options are proper radio buttons (one select only)
- ✅ Add-ons are checkboxes (multiple selections)
- ✅ Labels properly associated with inputs
- ✅ Section is hidden with `display: none` (not visibility: hidden)
- ✅ Form still works if CSS fails to load
- ✅ Price calculation accessible via JavaScript
- ✅ Semantic HTML structure maintained
- ✅ No images for critical information (uses text)

