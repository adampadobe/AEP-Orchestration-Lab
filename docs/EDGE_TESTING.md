# Edge testing for Experience Decisioning

Experience Decisioning **decisions** (which item to show) are evaluated on the **Adobe Experience Platform Edge Network**, not by calling `platform.adobe.io` from the browser for each decision.

## How the pieces fit

| Layer | Role |
|-------|------|
| **Platform REST** (`/data/core/dps/...`) | Create/update **decision items**, **item collections**, **selection strategies**, **ranking**, etc. |
| **Datastream + tags** | Route the site/app to the right org, sandbox linkage, and AJO / personalization services. |
| **Web SDK (`alloy`) or Mobile SDK** | Sends events to Edge; requests propositions with **`personalization.decisionScopes`**. |
| **Assurance** | Debug sessions, validate hits, simulate/preview propositions where supported. |

## Web: recommended pattern

1. Configure a **datastream** in Adobe Experience Platform Data Collection with the capabilities your org enables for Journey Optimizer / personalization.
2. Deploy **Web SDK** via **Adobe Launch** (Tags) or embed Alloy directly. This repo uses your **Launch development** script in `web/index.html` / `web/edge-test.html`; the Web SDK extension in that property should use the **same datastream** as your AJO setup.
3. Identify the user (ECID + optional known identities in XDM) so Edge can resolve profile and eligibility.
4. Call **`sendEvent`** with personalization scopes that match what you configured in AJO for **Experience Decisioning** (decision policy / scope names as defined in your implementation — align with your solution design, not the legacy “activity + placement” IDs unless you intentionally still use that pattern).

References:

- [sendEvent overview](https://experienceleague.adobe.com/en/docs/experience-platform/collection/js/commands/sendevent/overview)
- [renderDecisions](https://experienceleague.adobe.com/en/docs/experience-platform/collection/js/commands/sendevent/renderdecisions) and [personalization decision scopes](https://experienceleague.adobe.com/en/docs/experience-platform/collection/js/commands/sendevent/overview) (use `personalization.decisionScopes` in the event payload as per current Web SDK docs)
- [Personalization use cases overview](https://experienceleague.adobe.com/en/docs/experience-platform/collection/use-cases/personalization/pers-overview) (rendering propositions, flicker, display events)
- Mobile / Optimize extension: [Journey Optimizer Decisioning extension API reference](https://developer.adobe.com/client-sdks/edge/adobe-journey-optimizer-decisioning/api-reference/) (`updatePropositions`, `getPropositions`, decision scopes, Assurance simulation)

## Assurance

Use **Adobe Experience Platform Assurance** connected to your test app or Web SDK session to inspect Edge requests/responses and use guided workflows for preview/simulation where documented for your channel.

## This repo’s local pages

- **`/`** (`web/index.html`) — Profile (UPS via proxy), DPS REST presets, and **Edge**: `sendEvent` with profile email in `identityMap`; **`personalization.decisionScopes` is optional** (use on this bare page if Launch does not supply scopes). Use **Send identity to Edge / fetch decisions** or **Profile + content**. The page understands **`event.decisions`** and **`propositions`** and applies **html-content-item** / **json-content-item** to demo DOM aligned with two **channel configurations**: **`topRibbon`** (→ `.topRibbon`) and **`travel-hero-banner`** (→ `.travel-hero-banner` inner title / image / h1).
- **`/edge-test.html`** — Standalone Edge-only template (same Alloy pattern).

Edge calls go to Adobe’s Edge domain (`adobe.io` / regional hosts per documentation), **not** to `proxy_server.py`. The proxy is only for `platform.adobe.io` REST.

## Why “decision scopes” exist (and when you can skip typing them)

Edge still has to know **which** decision surfaces to evaluate for a given request. That is what **decision scopes** represent.

- **On a real page** (for example [Adobe Demo System Next](https://dsn.adobe.com/web/apalmer-I018/home)), scopes are usually **already wired** in **Launch**: a rule’s **sendEvent** action, the Web SDK extension defaults, or **render decisions** / surface configuration. You do **not** re-enter those strings in the browser by hand; you **set identity** (logged-in user, `identityMap`, URL parameters your implementation uses, etc.) and the existing rules send the right request.

- **On this repo’s minimal lab** (`index.html`), there were no Launch rules at first, so the UI asked for scopes so `sendEvent` had an explicit `personalization.decisionScopes` array. The lab now allows **leaving scopes empty** so you can mimic “identity-only” calls; if nothing comes back, add scopes **here** or test on your DSN page where Launch already supplies them.

### Firing a profile on your DSN page

On your own site, open the console after the page (and Launch) load, then send identity on an event (adjust `eventType` / fields to match your implementation):

```javascript
alloy("sendEvent", {
  renderDecisions: true,
  xdm: {
    eventType: "web.webpagedetails.pageViews",
    web: { webPageDetails: { URL: location.href } },
    identityMap: {
      email: [{ id: "YOUR_TEST_EMAIL", authenticatedState: "ambiguous", primary: true }],
    },
  },
});
```

If personalization is driven by a **specific rule** with fixed scopes, you may not need to pass `personalization.decisionScopes` in the console at all — your rule already does. If no decisions return, compare with the rule configuration in Tags and with profile eligibility in AJO.

---

## DSN / production page: short UAT checklist (console + Network)

Use this on a page that already loads your Launch library (for example [Adobe DSN](https://dsn.adobe.com/web/apalmer-I018/home)). Paste snippets in **DevTools → Console**. Replace the test email if needed.

### Checklist (do in order)

1. **Hard-refresh** the page (empty cache if you changed Tags) so the current Launch build loads.
2. Open **DevTools → Network**. Optionally enable **Preserve log** if redirects unload the panel.
3. Filter by **`interact`** (common for Web SDK → Edge) or your regional Edge host (often contains `adobedc` / `data.adobedc` — your tenant may differ). If you see no hits, filter **`collect`** or search Network for **`konductor`** / **`experience`** per your implementation.
4. **Reload** the page and select the first large **POST** to Edge. Open **Payload** (or **Request**). Use the browser search (**⌘F** / **Ctrl+F**) in that panel for:
   - `decisionScopes`
   - `decisionScope`
   - `personalization`
   - `query`
   This shows **whether and how** scopes are sent on the default page load (often from a Launch **sendEvent** or automatic personalization).
5. Open **Console** and run **Snippet A** (read-only inspection after a test `sendEvent`) or **Snippet B** (optional identity override). Compare console output with what you see under **Tags → Rules** for your **apalmer - Travel - DEI (web)** property.
6. In **Tags**, open the rule that fires personalization and confirm **sendEvent → personalization.decisionScopes** (or equivalent). Those strings should match what you find in Network / console.

### Snippet A — one `sendEvent`, log scopes + payloads

Sets a test email, waits for `alloy`, sends an event **without** adding `personalization.decisionScopes` (so you see what happens when **only Launch / defaults** apply). Then logs whatever comes back.

```javascript
(async function dsnPersonalizationUAT() {
  const TEST_EMAIL = "adamp.adobedemo+010426-4@gmail.com";

  function logResult(tag, result) {
    console.log("\n========== " + tag + " ==========");
    if (!result || typeof result !== "object") {
      console.log("(no object result)", result);
      return;
    }
    console.log("Top-level keys:", Object.keys(result));
    var props = result.propositions || [];
    var decs = result.decisions || [];
    console.log("propositions.length:", props.length, "| decisions.length:", decs.length);

    var payloads = decs.length ? decs : props;
    var label = decs.length ? "decisions" : "propositions";
    if (!payloads.length) {
      console.warn("No propositions or decisions — compare with Network payload (scopes?) and AJO eligibility.");
      return;
    }
    payloads.forEach(function (p, i) {
      var sd = p.scopeDetails || {};
      console.log(
        "[" + label + " " + i + "] scopeDetails:",
        JSON.stringify({
          name: sd.name,
          decisionScope: sd.decisionScope,
          characteristics: sd.characteristics,
        })
      );
      console.log("  id:", p.id, "| renderAttempted:", p.renderAttempted);
      (p.items || []).forEach(function (it, j) {
        console.log("  item[" + j + "] schema:", it.schema, "| has data.content:", it.data && it.data.content != null);
      });
    });
  }

  if (typeof alloy !== "function") {
    console.error("window.alloy is not a function — Launch/Web SDK not ready yet. Wait and retry.");
    return;
  }

  try {
    var result = await alloy("sendEvent", {
      renderDecisions: false,
      xdm: {
        eventType: "web.webpagedetails.pageViews",
        web: { webPageDetails: { URL: location.href, name: "DSN UAT console" } },
        identityMap: {
          email: [{ id: TEST_EMAIL, authenticatedState: "ambiguous", primary: true }],
        },
      },
    });
    logResult("sendEvent (no personalization.decisionScopes in this call)", result);
  } catch (e) {
    console.error("sendEvent failed:", e);
  }

  console.log("\n--- Next: compare with Network → interact POST body (search decisionScopes) ---");
})();
```

### Snippet B — same, but **with** explicit scopes (optional)

Use when Snippet A returns nothing but you know the scope strings from Tags. Paste your real scopes from the Launch **sendEvent** action.

```javascript
(async function dsnPersonalizationUATWithScopes() {
  const TEST_EMAIL = "adamp.adobedemo+010426-4@gmail.com";
  const DECISION_SCOPES = [
    /* paste from Launch, e.g. "ajoconfig:..." */
  ];

  if (typeof alloy !== "function") {
    console.error("alloy not ready");
    return;
  }
  var result = await alloy("sendEvent", {
    renderDecisions: false,
    personalization: { decisionScopes: DECISION_SCOPES },
    xdm: {
      eventType: "web.webpagedetails.pageViews",
      web: { webPageDetails: { URL: location.href } },
      identityMap: {
        email: [{ id: TEST_EMAIL, authenticatedState: "ambiguous", primary: true }],
      },
    },
  });
  console.log("With explicit scopes:", result);
})();
```

### How to read the results

| Observation | Likely meaning |
|-------------|----------------|
| Network payload contains **`decisionScopes`** on initial load | Launch (or extension) is sending scopes automatically; you don’t need to type them on that page. |
| Snippet A returns **`propositions` / `decisions`** with items | Edge returned content for those scopes; check **item.schema** vs your DOM rule (`html-content-item`, `json-content-item`). |
| Snippet A empty, Snippet B works | Scopes are required for that event path; align **DECISION_SCOPES** with Tags. |
| Both empty, profile qualifies in AJO | Check datastream services, sandbox, consent, surface/channel config, and that the decision policy targets the same identity. |

Optional: install **Adobe Experience Platform Debugger** from your browser extension store and use the **Edge** / **Web SDK** views to inspect the same traffic with a guided UI.
