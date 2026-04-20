// --- Tab switching with URL hash ---

function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
    document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });

    var btn = document.querySelector('.tab-btn[data-tab="' + tabId + '"]');
    if (btn) btn.classList.add("active");
    var panel = document.getElementById("tab-" + tabId);
    if (panel) panel.classList.add("active");

    if (history.replaceState) {
        history.replaceState(null, null, "#" + tabId);
    }
}

// Restore tab from URL hash on load
(function() {
    var hash = window.location.hash.replace("#", "");
    if (hash && document.getElementById("tab-" + hash)) {
        switchTab(hash);
    }
})();

document.querySelectorAll(".tab-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
        switchTab(this.getAttribute("data-tab"));
    });
});

// --- Asset category filtering ---

var filterBtns = document.querySelectorAll("#asset-filters .filter-btn");
var assetCards = document.querySelectorAll("#assets-grid .asset-card");

filterBtns.forEach(function(btn) {
    btn.addEventListener("click", function() {
        var filter = this.getAttribute("data-filter");
        filterBtns.forEach(function(b) { b.classList.remove("active"); });
        this.classList.add("active");
        assetCards.forEach(function(card) {
            if (filter === "all" || card.getAttribute("data-category") === filter) {
                card.style.display = "";
            } else {
                card.style.display = "none";
            }
        });
    });
});

// --- Persona expand/collapse ---

function togglePersonaExpand(card) {
    var detail = card.querySelector(".persona-compact-detail");
    if (!detail) return;
    var isExpanded = card.classList.contains("expanded");
    if (isExpanded) {
        card.classList.remove("expanded");
        detail.style.display = "none";
    } else {
        card.classList.add("expanded");
        detail.style.display = "block";
    }
}

// --- Accordion toggle ---

function toggleAccordion(headerBtn) {
    var body = headerBtn.nextElementSibling;
    if (!body) return;
    var isCollapsed = body.classList.contains("collapsed");
    if (isCollapsed) {
        body.classList.remove("collapsed");
        headerBtn.classList.remove("collapsed");
    } else {
        body.classList.add("collapsed");
        headerBtn.classList.add("collapsed");
    }
}

// --- Highlight + scroll helper ---

function scrollAndHighlight(selector) {
    var target = document.querySelector(selector);
    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("highlight-card");
        setTimeout(function() { target.classList.remove("highlight-card"); }, 1200);
    }
}

// --- Cross-link: Segment links (from Personas or Campaigns) ---

document.addEventListener("click", function(e) {
    var link = e.target.closest(".segment-link");
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    var segId = link.getAttribute("data-segment-id");
    if (!segId) return;
    switchTab("audiences");
    setTimeout(function() { scrollAndHighlight('[data-segment-id="' + segId + '"]'); }, 150);
});

// --- Cross-link: Campaign links (from Audiences or Accounts) ---

document.addEventListener("click", function(e) {
    var link = e.target.closest(".campaign-link");
    if (!link) return;
    e.preventDefault();
    e.stopPropagation();
    var campId = link.getAttribute("data-campaign-id");
    if (!campId) return;
    switchTab("campaigns");
    setTimeout(function() { scrollAndHighlight('[data-campaign-id="' + campId + '"]'); }, 150);
});

// --- Cross-link: Persona popover in Audiences tab ---

var activePopover = null;

function closePopover() {
    if (activePopover) {
        activePopover.remove();
        activePopover = null;
    }
}

document.addEventListener("click", function(e) {
    if (activePopover && !activePopover.contains(e.target) && !e.target.classList.contains("persona-popover-trigger")) {
        closePopover();
    }
});

document.addEventListener("click", function(e) {
    var btn = e.target.closest(".persona-popover-trigger");
    if (!btn) return;
    e.stopPropagation();
    var personaId = btn.getAttribute("data-persona-id");
    var personaName = btn.getAttribute("data-persona-name");

    if (activePopover && activePopover.dataset.forPersona === personaId) {
        closePopover();
        return;
    }
    closePopover();

    var popover = document.createElement("div");
    popover.className = "persona-popover";
    popover.dataset.forPersona = personaId;
    popover.innerHTML =
        '<div class="popover-name">' + personaName + '</div>' +
        '<a href="#" class="popover-link" data-goto-persona="' + personaId + '">View in Personas tab &rarr;</a>';

    btn.parentElement.style.position = "relative";
    btn.parentElement.appendChild(popover);
    activePopover = popover;

    popover.querySelector(".popover-link").addEventListener("click", function(ev) {
        ev.preventDefault();
        var pid = this.getAttribute("data-goto-persona");
        closePopover();
        navigateToPersona(pid);
    });
});

// --- Navigate to persona card ---

function navigateToPersona(personaId) {
    switchTab("personas");
    setTimeout(function() {
        var target = document.querySelector('[data-persona-id="' + personaId + '"]');
        if (target) {
            if (!target.classList.contains("expanded")) {
                togglePersonaExpand(target);
            }
            target.scrollIntoView({ behavior: "smooth", block: "center" });
            target.classList.add("highlight-card");
            setTimeout(function() { target.classList.remove("highlight-card"); }, 1200);
        }
    }, 150);
}
