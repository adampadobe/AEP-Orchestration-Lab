/**
 * Email cache for profile lookup and search.
 * Stores recently used emails in localStorage for autocomplete.
 */

const STORAGE_KEY = 'aep-profile-viewer-recent-emails';
const MAX_EMAILS = 20;

/** Padding from the right edge of the input treated as the "open suggestions" zone (datalist control). */
const LIST_ZONE_PX = 32;

/** Get recent emails from cache (newest first). */
function getRecentEmails() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === 'string' && e.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/** Add email to cache (moves to front if already present). */
function addEmail(email) {
  const e = (email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return;
  let list = getRecentEmails();
  list = list.filter((x) => x !== e);
  list.unshift(e);
  list = list.slice(0, MAX_EMAILS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded, ignore
  }
}

/**
 * Attach a datalist to an email input for autocomplete. Call on page load.
 * Browsers filter datalist options by the current value, so a filled email hides other
 * recent addresses. We briefly clear the field (with restore on blur) when the user
 * opens suggestions via the list zone (right edge) or Alt+ArrowDown so all recents show.
 */
function attachEmailDatalist(inputId, datalistId = 'recentEmails') {
  const input = document.getElementById(inputId);
  if (!input) return;
  let list = document.getElementById(datalistId);
  if (!list) {
    list = document.createElement('datalist');
    list.id = datalistId;
    document.body.appendChild(list);
  }
  input.setAttribute('list', datalistId);

  function refresh() {
    list.innerHTML = '';
    getRecentEmails().forEach((email) => {
      const opt = document.createElement('option');
      opt.value = email;
      list.appendChild(opt);
    });
  }

  function hasOtherCachedEmailThan(currentVal) {
    const lv = currentVal.trim().toLowerCase();
    const rec = getRecentEmails();
    if (!lv.includes('@') || rec.length === 0) return false;
    return rec.some((e) => e.toLowerCase() !== lv);
  }

  function stashAndClearForFullList() {
    const v = input.value.trim();
    if (!v.includes('@')) return;
    if (!hasOtherCachedEmailThan(v)) return;
    input.dataset.emailDatalistStash = v;
    input.value = '';
    refresh();
  }

  function clientXInListZone(clientX) {
    const r = input.getBoundingClientRect();
    return clientX >= r.right - LIST_ZONE_PX;
  }

  refresh();

  input.addEventListener('focus', refresh);

  input.addEventListener('mousedown', (e) => {
    if (e.target !== input) return;
    const v = input.value.trim();
    if (!v.includes('@')) return;
    if (!clientXInListZone(e.clientX)) return;
    stashAndClearForFullList();
  });

  input.addEventListener(
    'touchstart',
    (e) => {
      if (e.target !== input || !e.touches.length) return;
      const v = input.value.trim();
      if (!v.includes('@')) return;
      if (!clientXInListZone(e.touches[0].clientX)) return;
      stashAndClearForFullList();
    },
    { passive: true },
  );

  input.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'Down')) {
      const v = input.value.trim();
      if (!v.includes('@')) return;
      stashAndClearForFullList();
      e.preventDefault();
    }
  });

  let blurRestoreTimer;
  input.addEventListener('blur', () => {
    clearTimeout(blurRestoreTimer);
    blurRestoreTimer = setTimeout(() => {
      const stash = input.dataset.emailDatalistStash;
      if (stash == null) return;
      if (input.value.trim() === '') {
        input.value = stash;
      }
      delete input.dataset.emailDatalistStash;
    }, 200);
  });
}
