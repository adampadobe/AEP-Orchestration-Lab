# picker-html-rules.md — Use Case Picker HTML Specification

Copy `assets/three-use-case-picker.html` exactly and replace content as described below.

---

## Structure overview

```
.page-header          ← client logo + page title + Adobe wordmark
.prompt-strip         ← research summary paragraph + meta pills
.cards-grid           ← 3 × .uc-card side by side
.confirm-banner       ← appears when a card is selected, then navigates to card
```

---

## CSS brand colour variables

```css
:root {
  --brand:       #HEXCODE;
  --brand-dark:  #HEXCODE;
  --brand-light: #HEXCODE;
  --brand-mid:   #HEXCODE;
}
```

All styled elements (card bands, pills, buttons, prompt-strip border, bullet dots) update automatically from these four variables.

---

## Page header

```html
<div class="page-header-left">
  <img class="client-logo" src="https://logo.clearbit.com/[clientdomain]" alt="[Client Name]"
       onerror="this.style.display='none'; document.getElementById('logo-fb').style.display='block'">
  <span class="client-logo-fallback" id="logo-fb" style="display:none">[Client Name]</span>
  <div class="divider-v"></div>
  <div class="page-title">
    <strong>3 use cases found</strong> for [Client Name] · [Industry]
  </div>
</div>
```

---

## Prompt strip

Rewrite the paragraph to summarise the client research. Include:
- 1–2 specific stats or facts (from Step 1 research)
- The client's current strategic focus relevant to the use cases
- A note that use cases are ranked by strategic fit

```html
<div class="prompt-strip">
  <p>
    Based on research into <strong>[Client Name]</strong>, I've identified the three most commercially
    relevant use cases for your selected technology. [1-2 sentences of specific client context.]
    The use cases below are ranked by strategic fit for their current priorities.
  </p>
  <div class="prompt-meta">
    <span class="meta-pill">Industry: [Vertical]</span>
    <span class="meta-pill">[Product 1]</span>
    <span class="meta-pill">[Product 2]</span>
    <!-- one meta-pill per selected Adobe product -->
  </div>
</div>
```

---

## Use case cards (×3)

Each card has the same structure. Replace content only — do not change classes or layout.

```html
<div class="uc-card" onclick="selectCard(this, N)">

  <!-- Top band: brand coloured, number + type badge -->
  <div class="card-band">
    <div class="card-number">01</div>   <!-- 01, 02, 03 -->
    <div class="card-band-right">
      <span class="type-badge">Retention</span>  <!-- Retention / Upsell / Cross-sell / Acquisition -->
    </div>
  </div>

  <!-- Body: title + statement + bullets -->
  <div class="card-body">
    <div class="card-title">Use Case Short Name</div>
    <div class="card-statement">
      "I want to [action] [client] customers [outcome]."
    </div>
    <div class="bullets-label">Why this matters</div>
    <div class="bullets">
      <div class="bullet"><div class="bullet-dot"></div>Bullet one</div>
      <div class="bullet"><div class="bullet-dot"></div>Bullet two</div>
      <div class="bullet"><div class="bullet-dot"></div>Bullet three</div>
    </div>
  </div>

  <!-- Footer: product pills + select button -->
  <div class="card-footer">
    <div class="product-pills">
      <span class="product-pill">Real-Time CDP</span>
      <span class="product-pill">Journey Optimizer</span>
    </div>
    <button class="select-btn" onclick="selectCard(this.closest('.uc-card'), N); event.stopPropagation()">
      Select this use case
    </button>
  </div>

</div>
```

**Card statement:** First person, as if the CMO/Head of CX is speaking. Wrapped in quotes. Should be specific to the client — not generic.

**Bullets:** 3 items. Each should address a distinct commercial benefit. Keep to one sentence.

---

## JavaScript titles object

Update the `titles` object to match the three use case names exactly:

```javascript
const titles = {
  1: 'Use Case One Name',
  2: 'Use Case Two Name',
  3: 'Use Case Three Name'
};
```

---

## Confirm banner and navigation

When a card is selected, the confirm banner appears showing the selected use case name. The banner currently only shows a message — **add navigation to the use case card** by updating `selectCard()`:

```javascript
function selectCard(card, num) {
  document.querySelectorAll('.uc-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  const banner = document.getElementById('confirm-banner');
  document.getElementById('confirm-text').textContent = `"${titles[num]}" selected.`;
  banner.classList.add('visible');
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Navigate to the use case card after a brief pause
  setTimeout(() => {
    window.location.href = '[client-slug]-use-case-card.html';
  }, 1400);
}
```

The 1400ms delay gives the user time to see the confirm banner before navigating.

---

## Content rules

- **Rank by strategic fit** — card 01 should be the strongest use case for this client right now
- **Be specific** — reference the client's actual market position, customer base, or challenges
- **Statement format** — "I want to [identify/use/activate] [Client] customers [who/that] [condition] and [desired outcome]"
- **Bullets** — each bullet should address a distinct commercial benefit, not restate the same point three ways
- **Product pills** — list only the products that genuinely apply to this use case (don't include all selected products on every card if they don't all apply)
