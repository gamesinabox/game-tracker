import { auth, watchAuth, signIn, signOutUser, watchGames, saveGame, deleteGame } from "./firebase.js";
import { searchGames, rawgConfigured } from "./rawg.js";
import { parseSteamLibrary } from "./steam.js";
import { parsePlaystationLibrary } from "./playstation.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentUser = null;
let unsubscribeGames = null;
let games = [];
let activeTab = "dashboard";
let editingGameId = null; // null = add mode
let editingRawgPick = null; // metadata picked from RAWG search, merged on save
let detailGameId = null;
let selectMode = false;
const selectedIds = new Set();

const filters = { search: "", status: "all", platform: "all", tag: "all", sort: "added-desc", view: "grid" };

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------

const $ = (id) => document.getElementById(id);

const signedOutEl = $("signed-out");
const signedOutError = $("signed-out-error");
const appEl = $("app");
const userAvatar = $("user-avatar");
const userName = $("user-name");

const statGrid = $("stat-grid");
const heatmapEl = $("heatmap");
const heatmapEmpty = $("heatmap-empty");
const spotlightRow = $("spotlight-row");
const spotlightEmpty = $("spotlight-empty");
const pickerResult = $("picker-result");
const loadingSkeleton = $("loading-skeleton");
const themeToggleBtn = $("theme-toggle");

const gameGrid = $("game-grid");
const gameTableWrap = $("game-table-wrap");
const gameTableBody = $("game-table-body");
const libraryEmpty = $("library-empty");
const reorderHint = $("reorder-hint");
const filterSearch = $("filter-search");
const filterStatus = $("filter-status");
const filterPlatform = $("filter-platform");
const filterTag = $("filter-tag");
const filterSort = $("filter-sort");
const viewGridBtn = $("view-grid-btn");
const viewListBtn = $("view-list-btn");
const selectModeBtn = $("select-mode-btn");
const bulkBar = $("bulk-bar");
const bulkCount = $("bulk-count");
const bulkStatusSelect = $("bulk-status");
const bulkTagInput = $("bulk-tag");
const bulkTagBtn = $("bulk-tag-btn");
const bulkDeleteBtn = $("bulk-delete-btn");

const editBackdrop = $("edit-modal-backdrop");
const editTitleEl = $("edit-modal-title");
const rawgSearchInput = $("rawg-search");
const rawgResultsEl = $("rawg-results");
const gameTitleInput = $("game-title");
const gamePlatformInput = $("game-platform");
const gameStatusInput = $("game-status");
const gamePriceInput = $("game-price");
const gameAcquisitionInput = $("game-acquisition");
const gameTagsInput = $("game-tags");
const gamePriorityInput = $("game-priority");
const gameEstHoursInput = $("game-est-hours");
const editDeleteBtn = $("edit-delete-btn");

const detailBackdrop = $("detail-modal-backdrop");
const detailCover = $("detail-cover");
const detailTitle = $("detail-title");
const detailMeta = $("detail-meta");
const detailStars = $("detail-stars");
const detailTags = $("detail-tags");
const detailChecklist = $("detail-checklist");
const detailSessions = $("detail-sessions");
const detailMemories = $("detail-memories");

const steamBackdrop = $("steam-modal-backdrop");
const steamPasteInput = $("steam-paste");

const psnBackdrop = $("psn-modal-backdrop");
const psnPasteInput = $("psn-paste");

const yearBackdrop = $("year-modal-backdrop");
const yearModalTitle = $("year-modal-title");
const yearReviewBody = $("year-review-body");

const toastEl = $("toast");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function coverBackground(game) {
  if (game.coverImage) {
    const safe = encodeURI(game.coverImage).replace(/'/g, "%27");
    return `background-image:url('${safe}')`;
  }
  const h1 = hashString(game.title || "?") % 360;
  const h2 = (h1 + 55) % 360;
  return `background-image:linear-gradient(135deg,hsl(${h1},55%,35%),hsl(${h2},60%,22%))`;
}

function platformIcon(platform) {
  const p = (platform || "").toLowerCase();
  if (/pc|steam|epic/.test(p)) return "🖥️";
  if (/switch|nintendo/.test(p)) return "🍄";
  if (/playstation|ps\d/.test(p)) return "🎮";
  if (/xbox/.test(p)) return "🟩";
  if (/mobile|ios|android/.test(p)) return "📱";
  return "🕹️";
}

function formatMinutes(total) {
  if (!total) return "0h";
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function gameMinutes(game) {
  return (game.sessions || []).reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);
}

function genId() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
}

function daysSince(ts) {
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (toastEl.hidden = true), 2400);
}

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

function effectiveTheme() {
  const stored = localStorage.getItem("theme");
  if (stored) return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggleBtn.textContent = theme === "dark" ? "☀️" : "🌙";
}

applyTheme(effectiveTheme());

themeToggleBtn.addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

$("sign-in-btn").addEventListener("click", async () => {
  signedOutError.textContent = "";
  try {
    await signIn();
  } catch (e) {
    signedOutError.textContent = e.message || "Sign-in failed.";
  }
});

$("sign-out-btn").addEventListener("click", () => signOutUser());

watchAuth((user) => {
  currentUser = user;
  if (unsubscribeGames) {
    unsubscribeGames();
    unsubscribeGames = null;
  }
  if (user) {
    signedOutEl.hidden = true;
    appEl.hidden = false;
    loadingSkeleton.hidden = false;
    userAvatar.src = user.photoURL || "";
    userName.textContent = user.displayName || user.email || "";
    unsubscribeGames = watchGames(
      user.uid,
      (list) => {
        games = list;
        loadingSkeleton.hidden = true;
        renderAll();
      },
      (err) => {
        loadingSkeleton.hidden = true;
        showToast(`Sync error: ${err.message}`);
      }
    );
  } else {
    signedOutEl.hidden = false;
    appEl.hidden = true;
    games = [];
    resetAppBackground();
  }
});

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeTab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b === btn));
    $("view-dashboard").hidden = activeTab !== "dashboard";
    $("view-library").hidden = activeTab !== "library";
    renderAll();
  });
});

// ---------------------------------------------------------------------------
// Render orchestration
// ---------------------------------------------------------------------------

function renderAll() {
  renderStats();
  renderHeatmap();
  renderSpotlight();
  updateAppBackground();
  renderFilterOptions();
  renderLibrary();
}

// ---------------------------------------------------------------------------
// Currently-playing quick actions (delete / mark playing / nominate #1)
// ---------------------------------------------------------------------------

async function quickDelete(id) {
  const g = games.find((x) => x.id === id);
  if (!g) return;
  if (!confirm(`Delete "${g.title}"? This can't be undone.`)) return;
  try {
    await deleteGame(currentUser.uid, id);
    showToast("Deleted.");
  } catch (e) {
    showToast(`Delete failed: ${e.message}`);
  }
}

async function quickMarkPlaying(id) {
  const g = games.find((x) => x.id === id);
  if (!g) return;
  try {
    await saveGame(currentUser.uid, { id, status: "playing", dateStarted: g.dateStarted || Date.now() });
    showToast(`${g.title} marked as playing.`);
  } catch (e) {
    showToast(`Couldn't update: ${e.message}`);
  }
}

function getPrimaryPlayingGame() {
  const playing = games.filter((g) => g.status === "playing");
  if (!playing.length) return null;
  return playing.find((g) => g.primary) || playing[0];
}

async function setPrimaryPlaying(id) {
  const prev = games.find((g) => g.primary && g.id !== id);
  try {
    const tasks = [saveGame(currentUser.uid, { id, primary: true })];
    if (prev) tasks.push(saveGame(currentUser.uid, { id: prev.id, primary: false }));
    await Promise.all(tasks);
  } catch (e) {
    showToast(`Couldn't set background game: ${e.message}`);
  }
}

// Binds click handlers for the delete / mark-playing / nominate-#1 buttons
// rendered on both the library grid cards and the library table rows.
function attachCardActions(root) {
  root.querySelectorAll(".card-action-btn[data-action]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (btn.dataset.action === "delete") quickDelete(id);
      else if (btn.dataset.action === "play") quickMarkPlaying(id);
      else if (btn.dataset.action === "primary") setPrimaryPlaying(id);
    });
  });
}

let bgActiveLayer = "a";
let lastBgKey = null;

function resetAppBackground() {
  lastBgKey = null;
  bgActiveLayer = "a";
  $("bg-layer-a").classList.remove("active");
  $("bg-layer-b").classList.remove("active");
}

function updateAppBackground() {
  const primary = getPrimaryPlayingGame();
  const key = primary ? primary.coverImage || `hash:${primary.title}` : null;
  if (key === lastBgKey) return;
  lastBgKey = key;

  const showing = bgActiveLayer === "a" ? $("bg-layer-a") : $("bg-layer-b");
  const hidden = bgActiveLayer === "a" ? $("bg-layer-b") : $("bg-layer-a");

  if (!primary) {
    showing.classList.remove("active");
    hidden.classList.remove("active");
    return;
  }

  hidden.style.cssText = coverBackground(primary);
  hidden.classList.add("active");
  showing.classList.remove("active");
  bgActiveLayer = bgActiveLayer === "a" ? "b" : "a";
}

// ---------------------------------------------------------------------------
// Dashboard: stats
// ---------------------------------------------------------------------------

function renderStats() {
  const total = games.length;
  const backlog = games.filter((g) => g.status === "backlog").length;
  const thisYear = new Date().getFullYear();
  const completedThisYear = games.filter(
    (g) => g.status === "completed" && g.dateCompleted && new Date(g.dateCompleted).getFullYear() === thisYear
  ).length;
  const rated = games.filter((g) => typeof g.rating === "number");
  const avgRating = rated.length
    ? (rated.reduce((s, g) => s + g.rating, 0) / rated.length).toFixed(1)
    : "—";
  const totalMinutes = games.reduce((s, g) => s + gameMinutes(g), 0);

  let bestValue = null;
  for (const g of games) {
    const mins = gameMinutes(g);
    if (g.pricePaid > 0 && mins > 0) {
      const perHour = g.pricePaid / (mins / 60);
      if (!bestValue || perHour < bestValue.perHour) bestValue = { title: g.title, perHour };
    }
  }

  const estimated = games.filter((g) => g.status === "backlog" && typeof g.estimatedHours === "number");
  const hoursLeft = estimated.reduce((s, g) => s + g.estimatedHours, 0);

  const tiles = [
    { value: total, label: "Games tracked" },
    { value: backlog, label: "In backlog" },
    { value: completedThisYear, label: `Completed in ${thisYear}` },
    { value: avgRating, label: "Average rating" },
    { value: formatMinutes(totalMinutes), label: "Total time played" },
    {
      value: bestValue ? `$${bestValue.perHour.toFixed(2)}/hr` : "—",
      label: bestValue ? `Best value: ${bestValue.title}` : "Best value",
    },
    {
      value: estimated.length ? `${hoursLeft}h` : "—",
      label: estimated.length < backlog ? `Backlog left (${estimated.length}/${backlog} estimated)` : "Backlog hours left",
    },
  ];

  statGrid.innerHTML = tiles
    .map(
      (t) => `<div class="stat-tile"><div class="value">${escapeHtml(String(t.value))}</div><div class="label">${escapeHtml(t.label)}</div></div>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Dashboard: play activity heatmap
// ---------------------------------------------------------------------------

function heatLevel(minutes) {
  if (!minutes) return 0;
  if (minutes <= 30) return 1;
  if (minutes <= 90) return 2;
  if (minutes <= 180) return 3;
  return 4;
}

function renderHeatmap() {
  const minutesByDate = {};
  for (const g of games) {
    for (const s of g.sessions || []) {
      if (!s.date) continue;
      minutesByDate[s.date] = (minutesByDate[s.date] || 0) + (Number(s.minutes) || 0);
    }
  }

  const hasAny = Object.keys(minutesByDate).length > 0;
  heatmapEmpty.hidden = hasAny;
  if (!hasAny) {
    heatmapEl.innerHTML = "";
    return;
  }

  const WEEKS = 20;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Start on the Sunday that begins the (WEEKS-1)-th week before this week,
  // so the grid ends on the Saturday of the current week (today always included).
  const start = new Date(today);
  start.setDate(start.getDate() - today.getDay() - (WEEKS - 1) * 7);

  let html = "";
  const cursor = new Date(start);
  for (let w = 0; w < WEEKS; w++) {
    html += '<div class="heatmap-week">';
    for (let d = 0; d < 7; d++) {
      const key = cursor.toISOString().slice(0, 10);
      const mins = minutesByDate[key] || 0;
      const level = heatLevel(mins);
      const label = mins ? `${key}: ${formatMinutes(mins)} played` : key;
      html += `<div class="heatmap-day" data-level="${level}" title="${escapeHtml(label)}"></div>`;
      cursor.setDate(cursor.getDate() + 1);
    }
    html += "</div>";
  }
  heatmapEl.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Dashboard: currently playing spotlight
// ---------------------------------------------------------------------------

function renderSpotlight() {
  const playing = games.filter((g) => g.status === "playing");
  spotlightEmpty.hidden = playing.length > 0;
  const primaryId = getPrimaryPlayingGame()?.id;
  spotlightRow.innerHTML = playing
    .map((g) => {
      const sessions = g.sessions || [];
      const last = sessions.length ? sessions[sessions.length - 1] : null;
      const stale = last && daysSince(new Date(last.date).getTime()) > 14;
      const metaLine = last
        ? `${stale ? '<span class="stale-flag">⚠ stale — </span>' : ""}last played ${escapeHtml(last.date)}`
        : "no sessions logged yet";
      const isPrimary = g.id === primaryId;
      return `
        <div class="spotlight-card" data-id="${g.id}">
          <div class="cover" style="${coverBackground(g)}">
            <button class="card-action-btn ${isPrimary ? "active" : ""}" data-action="primary" data-id="${g.id}" title="${isPrimary ? "This game is the app background" : "Set as #1 — app background"}">${isPrimary ? "★" : "☆"}</button>
          </div>
          <div class="body">
            <div class="title">${escapeHtml(g.title)}</div>
            <div class="meta">${metaLine}</div>
          </div>
        </div>`;
    })
    .join("");
  spotlightRow.querySelectorAll(".spotlight-card").forEach((el) =>
    el.addEventListener("click", () => openDetailModal(el.dataset.id))
  );
  attachCardActions(spotlightRow);
}

// ---------------------------------------------------------------------------
// Dashboard: random picker
// ---------------------------------------------------------------------------

$("picker-btn").addEventListener("click", () => {
  const backlog = games.filter((g) => g.status === "backlog");
  if (!backlog.length) {
    pickerResult.innerHTML = `<span class="empty-hint">Your backlog is empty — add something first.</span>`;
    return;
  }
  const pick = backlog[Math.floor(Math.random() * backlog.length)];
  pickerResult.innerHTML = `
    <div class="cover" style="${coverBackground(pick)};width:48px;height:48px;border-radius:8px;background-size:cover;background-position:center;flex-shrink:0"></div>
    <div>
      <div class="title" style="font-weight:600">${escapeHtml(pick.title)}</div>
      <div class="sub" style="color:var(--text-dim);font-size:0.8rem">${escapeHtml(pick.platform || "")}</div>
    </div>`;
  pickerResult.style.cursor = "pointer";
  pickerResult.onclick = () => openDetailModal(pick.id);
});

// ---------------------------------------------------------------------------
// Import / Export
// ---------------------------------------------------------------------------

$("export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(games, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backlog-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

$("import-btn").addEventListener("click", () => $("import-file").click());

$("import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of games.");
    let count = 0;
    for (const g of parsed) {
      if (!g.title) continue;
      const { id, ...data } = g;
      await saveGame(currentUser.uid, { id: undefined, ...data, dateAdded: data.dateAdded || Date.now() });
      count++;
    }
    showToast(`Imported ${count} game${count === 1 ? "" : "s"}.`);
  } catch (err) {
    showToast(`Import failed: ${err.message}`);
  } finally {
    e.target.value = "";
  }
});

// ---------------------------------------------------------------------------
// Library: filters + grid
// ---------------------------------------------------------------------------

function renderFilterOptions() {
  const platforms = [...new Set(games.map((g) => g.platform).filter(Boolean))].sort();
  const tags = [...new Set(games.flatMap((g) => g.tags || []))].sort();

  const fill = (select, values, current) => {
    const keep = [...select.options].find((o) => o.value === current) ? current : "all";
    select.innerHTML =
      `<option value="all">${select.id === "filter-platform" ? "All platforms" : "All tags"}</option>` +
      values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
    select.value = keep;
  };
  fill(filterPlatform, platforms, filters.platform);
  fill(filterTag, tags, filters.tag);
}

[filterSearch, filterStatus, filterPlatform, filterTag, filterSort].forEach((el) => {
  const evt = el.tagName === "SELECT" ? "change" : "input";
  el.addEventListener(evt, () => {
    filters.search = filterSearch.value.trim().toLowerCase();
    filters.status = filterStatus.value;
    filters.platform = filterPlatform.value;
    filters.tag = filterTag.value;
    filters.sort = filterSort.value;
    renderLibrary();
  });
});

function matchesSearch(g, search) {
  if (!search) return true;
  if (g.title.toLowerCase().includes(search)) return true;
  if ((g.sessions || []).some((s) => (s.note || "").toLowerCase().includes(search))) return true;
  if ((g.memories || []).some((m) => (m.note || "").toLowerCase().includes(search))) return true;
  return false;
}

viewGridBtn.addEventListener("click", () => setLibraryView("grid"));
viewListBtn.addEventListener("click", () => setLibraryView("list"));

function setLibraryView(view) {
  filters.view = view;
  viewGridBtn.classList.toggle("active", view === "grid");
  viewListBtn.classList.toggle("active", view === "list");
  gameGrid.hidden = view !== "grid";
  gameTableWrap.hidden = view !== "list";
  renderLibrary();
}

selectModeBtn.addEventListener("click", () => {
  selectMode = !selectMode;
  selectModeBtn.textContent = selectMode ? "Cancel" : "Select";
  selectModeBtn.classList.toggle("btn-primary", selectMode);
  if (!selectMode) selectedIds.clear();
  renderLibrary();
});

function updateBulkBar() {
  bulkBar.hidden = selectedIds.size === 0;
  bulkCount.textContent = `${selectedIds.size} selected`;
}

bulkTagBtn.addEventListener("click", async () => {
  const tag = bulkTagInput.value.trim();
  if (!tag) return;
  try {
    await Promise.all(
      [...selectedIds].map((id) => {
        const g = games.find((x) => x.id === id);
        const tags = new Set(g?.tags || []);
        tags.add(tag);
        return saveGame(currentUser.uid, { id, tags: [...tags] });
      })
    );
    bulkTagInput.value = "";
    showToast("Tag added.");
  } catch (e) {
    showToast(`Couldn't add tag: ${e.message}`);
  }
});

bulkStatusSelect.addEventListener("change", async () => {
  const status = bulkStatusSelect.value;
  if (!status) return;
  try {
    await Promise.all([...selectedIds].map((id) => saveGame(currentUser.uid, { id, status })));
    showToast("Status updated.");
  } catch (e) {
    showToast(`Couldn't update status: ${e.message}`);
  } finally {
    bulkStatusSelect.value = "";
  }
});

bulkDeleteBtn.addEventListener("click", async () => {
  if (!confirm(`Delete ${selectedIds.size} game${selectedIds.size === 1 ? "" : "s"}? This can't be undone.`)) return;
  try {
    await Promise.all([...selectedIds].map((id) => deleteGame(currentUser.uid, id)));
    selectedIds.clear();
    showToast("Deleted.");
  } catch (e) {
    showToast(`Delete failed: ${e.message}`);
  }
});

let currentLibraryList = [];
let draggedId = null;

function renderLibrary() {
  const search = filters.search;
  let list = games.filter((g) => {
    if (!matchesSearch(g, search)) return false;
    if (filters.status !== "all" && g.status !== filters.status) return false;
    if (filters.platform !== "all" && g.platform !== filters.platform) return false;
    if (filters.tag !== "all" && !(g.tags || []).includes(filters.tag)) return false;
    return true;
  });

  const sorters = {
    "added-desc": (a, b) => (b.dateAdded || 0) - (a.dateAdded || 0),
    "rating-desc": (a, b) => (b.rating ?? -1) - (a.rating ?? -1),
    "rating-asc": (a, b) => (a.rating ?? 999) - (b.rating ?? 999),
    "title-asc": (a, b) => a.title.localeCompare(b.title),
    "priority-asc": (a, b) => (a.priority ?? 999999) - (b.priority ?? 999999),
  };
  list.sort(sorters[filters.sort] || sorters["added-desc"]);
  currentLibraryList = list;

  const reorderable = filters.sort === "priority-asc" && list.length > 1 && filters.view === "grid" && !selectMode;
  reorderHint.hidden = !reorderable;
  gameGrid.classList.toggle("reorderable", reorderable);

  libraryEmpty.hidden = list.length > 0;
  updateBulkBar();

  if (filters.view === "list") {
    renderLibraryTable(list);
    return;
  }

  const primaryId = getPrimaryPlayingGame()?.id;

  gameGrid.innerHTML = list
    .map((g, i) => {
      const ratingBadge = typeof g.rating === "number" ? `<span class="rating-badge">★ ${g.rating}/10</span>` : "";
      const tagRow = (g.tags || [])
        .slice(0, 3)
        .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
        .join("");
      const checkbox = selectMode
        ? `<input type="checkbox" class="card-select" data-id="${g.id}" ${selectedIds.has(g.id) ? "checked" : ""} />`
        : "";
      const isPrimary = g.id === primaryId;
      const statusAction = g.status === "playing"
        ? `<button class="card-action-btn ${isPrimary ? "active" : ""}" data-action="primary" data-id="${g.id}" title="${isPrimary ? "This game is the app background" : "Set as #1 — app background"}">${isPrimary ? "★" : "☆"}</button>`
        : `<button class="card-action-btn" data-action="play" data-id="${g.id}" title="Mark as currently playing">▶</button>`;
      return `
        <div class="game-card" data-id="${g.id}" data-status="${escapeHtml(g.status)}" style="animation-delay:${Math.min(i, 12) * 25}ms" ${reorderable ? 'draggable="true"' : ""}>
          ${checkbox}
          <div class="cover" style="${coverBackground(g)}">
            <span class="status-pill">${escapeHtml(g.status)}</span>
            <span class="platform-icon">${platformIcon(g.platform)}</span>
            <div class="card-actions">
              ${statusAction}
              <button class="card-action-btn" data-action="delete" data-id="${g.id}" title="Delete">🗑</button>
            </div>
          </div>
          <div class="body">
            <div class="title">${escapeHtml(g.title)}</div>
            <div class="sub">${escapeHtml(g.platform || "")}</div>
            ${ratingBadge}
            <div class="tag-row">${tagRow}</div>
          </div>
        </div>`;
    })
    .join("");

  attachCardActions(gameGrid);

  gameGrid.querySelectorAll(".card-select").forEach((cb) => {
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) selectedIds.add(cb.dataset.id);
      else selectedIds.delete(cb.dataset.id);
      updateBulkBar();
    });
  });

  gameGrid.querySelectorAll(".game-card").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.classList.contains("dragging")) return;
      if (selectMode) {
        const cb = el.querySelector(".card-select");
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
        return;
      }
      openDetailModal(el.dataset.id);
    });
    if (!reorderable) return;

    el.addEventListener("dragstart", () => {
      draggedId = el.dataset.id;
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      gameGrid.querySelectorAll(".drag-over").forEach((n) => n.classList.remove("drag-over"));
    });
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (el.dataset.id !== draggedId) el.classList.add("drag-over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drag-over"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.classList.remove("drag-over");
      const targetId = el.dataset.id;
      if (!draggedId || draggedId === targetId) return;
      await reorderBacklog(draggedId, targetId);
    });
  });
}

function renderLibraryTable(list) {
  const primaryId = getPrimaryPlayingGame()?.id;

  gameTableBody.innerHTML = list
    .map((g) => {
      const ratingCell = typeof g.rating === "number" ? `★ ${g.rating}/10` : "—";
      const tagRow = (g.tags || [])
        .slice(0, 3)
        .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
        .join("");
      const checkbox = selectMode
        ? `<input type="checkbox" data-id="${g.id}" ${selectedIds.has(g.id) ? "checked" : ""} />`
        : "";
      const isPrimary = g.id === primaryId;
      const statusAction = g.status === "playing"
        ? `<button class="card-action-btn ${isPrimary ? "active" : ""}" data-action="primary" data-id="${g.id}" title="${isPrimary ? "This game is the app background" : "Set as #1 — app background"}">${isPrimary ? "★" : "☆"}</button>`
        : `<button class="card-action-btn" data-action="play" data-id="${g.id}" title="Mark as currently playing">▶</button>`;
      return `
        <tr data-id="${g.id}" data-status="${escapeHtml(g.status)}">
          <td>${checkbox}</td>
          <td><div class="row-cover" style="${coverBackground(g)}"></div></td>
          <td>${escapeHtml(g.title)}</td>
          <td>${escapeHtml(g.platform || "")}</td>
          <td><span class="row-status">${escapeHtml(g.status)}</span></td>
          <td>${escapeHtml(ratingCell)}</td>
          <td><div class="tag-row">${tagRow}</div></td>
          <td>
            <div class="row-actions">
              ${statusAction}
              <button class="card-action-btn" data-action="delete" data-id="${g.id}" title="Delete">🗑</button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  attachCardActions(gameTableBody);

  gameTableBody.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      if (cb.checked) selectedIds.add(cb.dataset.id);
      else selectedIds.delete(cb.dataset.id);
      updateBulkBar();
    });
  });

  gameTableBody.querySelectorAll("tr").forEach((row) => {
    row.addEventListener("click", () => {
      if (selectMode) {
        const cb = row.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
        return;
      }
      openDetailModal(row.dataset.id);
    });
  });
}

async function reorderBacklog(fromId, toId) {
  const order = currentLibraryList.map((g) => g.id);
  const fromIdx = order.indexOf(fromId);
  const toIdx = order.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return;
  order.splice(toIdx, 0, order.splice(fromIdx, 1)[0]);

  try {
    await Promise.all(
      order.map((id, i) => saveGame(currentUser.uid, { id, priority: i }))
    );
  } catch (e) {
    showToast(`Couldn't save new order: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Add / Edit modal
// ---------------------------------------------------------------------------

$("add-game-btn").addEventListener("click", () => openEditModal(null));
$("edit-modal-close").addEventListener("click", closeEditModal);
$("edit-cancel-btn").addEventListener("click", closeEditModal);
editBackdrop.addEventListener("click", (e) => { if (e.target === editBackdrop) closeEditModal(); });

function openEditModal(gameId) {
  editingGameId = gameId;
  editingRawgPick = null;
  const g = gameId ? games.find((x) => x.id === gameId) : null;

  editTitleEl.textContent = g ? "Edit game" : "Add game";
  editDeleteBtn.hidden = !g;
  rawgSearchInput.value = "";
  rawgResultsEl.hidden = true;
  rawgSearchInput.placeholder = rawgConfigured() ? "Start typing a title…" : "Add a RAWG API key in js/config.js to enable search";
  rawgSearchInput.disabled = !rawgConfigured();

  gameTitleInput.value = g?.title || "";
  gamePlatformInput.value = g?.platform || "";
  gameStatusInput.value = g?.status || "backlog";
  gamePriceInput.value = g?.pricePaid ?? "";
  gameAcquisitionInput.value = g?.acquisition || "owned";
  gameTagsInput.value = (g?.tags || []).join(", ");
  gamePriorityInput.value = g?.priority ?? "";
  gameEstHoursInput.value = g?.estimatedHours ?? "";

  editBackdrop.hidden = false;
  gameTitleInput.focus();
}

function closeEditModal() {
  editBackdrop.hidden = true;
}

let rawgDebounce;
rawgSearchInput.addEventListener("input", () => {
  clearTimeout(rawgDebounce);
  const q = rawgSearchInput.value.trim();
  if (!q) { rawgResultsEl.hidden = true; return; }
  rawgDebounce = setTimeout(async () => {
    const results = await searchGames(q);
    if (!results.length) { rawgResultsEl.hidden = true; return; }
    rawgResultsEl.hidden = false;
    rawgResultsEl.innerHTML = results
      .map(
        (r, i) => `
        <div class="rawg-result-item" data-i="${i}">
          ${r.coverImage ? `<img src="${escapeHtml(r.coverImage)}" alt="" />` : `<div class="rawg-result-item-noimg"></div>`}
          <div>
            <div class="name">${escapeHtml(r.title)}</div>
            <div class="year">${escapeHtml(r.released ? r.released.slice(0, 4) : "")} ${escapeHtml((r.platforms || []).slice(0, 3).join(", "))}</div>
          </div>
        </div>`
      )
      .join("");
    rawgResultsEl.querySelectorAll(".rawg-result-item").forEach((el) => {
      el.addEventListener("click", () => {
        const r = results[Number(el.dataset.i)];
        editingRawgPick = r;
        gameTitleInput.value = r.title;
        if (!gamePlatformInput.value && r.platforms?.length) gamePlatformInput.value = r.platforms[0];
        if (!gameTagsInput.value && r.genres?.length) gameTagsInput.value = r.genres.join(", ");
        rawgResultsEl.hidden = true;
        rawgSearchInput.value = r.title;
      });
    });
  }, 350);
});

$("edit-save-btn").addEventListener("click", async () => {
  const title = gameTitleInput.value.trim();
  if (!title) { showToast("Title is required."); return; }

  const existing = editingGameId ? games.find((x) => x.id === editingGameId) : null;
  const status = gameStatusInput.value;

  const data = {
    title,
    platform: gamePlatformInput.value.trim(),
    status,
    pricePaid: gamePriceInput.value === "" ? null : Number(gamePriceInput.value),
    acquisition: gameAcquisitionInput.value,
    tags: gameTagsInput.value.split(",").map((t) => t.trim()).filter(Boolean),
    priority: gamePriorityInput.value === "" ? null : Number(gamePriorityInput.value),
    estimatedHours: gameEstHoursInput.value === "" ? null : Number(gameEstHoursInput.value),
    rating: existing?.rating ?? null,
    sessions: existing?.sessions || [],
    memories: existing?.memories || [],
    checklist: existing?.checklist || { story: false, hundred: false, achievements: false },
    steamAppId: existing?.steamAppId ?? null,
    dateAdded: existing?.dateAdded || Date.now(),
    dateStarted: existing?.dateStarted || null,
    dateCompleted: existing?.dateCompleted || null,
    coverImage: editingRawgPick?.coverImage ?? existing?.coverImage ?? null,
    rawgId: editingRawgPick?.rawgId ?? existing?.rawgId ?? null,
    primary: status === "playing" ? (existing?.primary ?? false) : false,
  };

  if (status === "playing" && !data.dateStarted) data.dateStarted = Date.now();
  if (status === "completed" && !data.dateCompleted) data.dateCompleted = Date.now();

  try {
    await saveGame(currentUser.uid, { id: editingGameId || undefined, ...data });
    showToast(existing ? "Saved." : "Added to your library.");
    closeEditModal();
  } catch (e) {
    showToast(`Save failed: ${e.message}`);
  }
});

editDeleteBtn.addEventListener("click", async () => {
  if (!editingGameId) return;
  if (!confirm("Delete this game and all its notes? This can't be undone.")) return;
  try {
    await deleteGame(currentUser.uid, editingGameId);
    showToast("Deleted.");
    closeEditModal();
  } catch (e) {
    showToast(`Delete failed: ${e.message}`);
  }
});

// ---------------------------------------------------------------------------
// Detail modal
// ---------------------------------------------------------------------------

$("detail-modal-close").addEventListener("click", closeDetailModal);
detailBackdrop.addEventListener("click", (e) => { if (e.target === detailBackdrop) closeDetailModal(); });
$("detail-edit-btn").addEventListener("click", () => {
  closeDetailModal();
  openEditModal(detailGameId);
});

function openDetailModal(gameId) {
  detailGameId = gameId;
  renderDetail();
  detailBackdrop.hidden = false;
}

function closeDetailModal() {
  detailBackdrop.hidden = true;
  detailGameId = null;
}

function renderDetail() {
  const g = games.find((x) => x.id === detailGameId);
  if (!g) { closeDetailModal(); return; }

  detailCover.style.cssText = coverBackground(g);
  detailTitle.textContent = g.title;
  const mins = gameMinutes(g);
  const valueLine = g.pricePaid > 0 && mins > 0 ? ` · $${(g.pricePaid / (mins / 60)).toFixed(2)}/hr` : "";
  detailMeta.textContent = `${g.platform || "Unknown platform"} · ${g.status} · ${formatMinutes(mins)} played${valueLine}`;

  detailStars.innerHTML = Array.from({ length: 10 }, (_, i) => i + 1)
    .map((n) => `<button data-n="${n}" class="${g.rating >= n ? "filled" : ""}">★</button>`)
    .join("");
  detailStars.querySelectorAll("button").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const n = Number(btn.dataset.n);
      const newRating = g.rating === n ? null : n;
      try {
        await saveGame(currentUser.uid, { id: g.id, rating: newRating });
      } catch (e) {
        showToast(`Couldn't save rating: ${e.message}`);
      }
    })
  );

  detailTags.innerHTML = (g.tags || []).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");

  const checklist = g.checklist || {};
  detailChecklist.querySelectorAll("input[type=checkbox]").forEach((cb) => {
    cb.checked = Boolean(checklist[cb.dataset.key]);
    cb.onchange = async () => {
      try {
        await saveGame(currentUser.uid, { id: g.id, checklist: { ...checklist, [cb.dataset.key]: cb.checked } });
      } catch (e) {
        showToast(`Couldn't save: ${e.message}`);
      }
    };
  });

  const sessions = [...(g.sessions || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  detailSessions.innerHTML = sessions.length
    ? sessions
        .map(
          (s) => `<div class="log-entry"><div class="log-meta">${escapeHtml(s.date)} · ${s.minutes || 0} min</div>${escapeHtml(s.note || "")}</div>`
        )
        .join("")
    : `<p class="empty-hint">No sessions logged yet.</p>`;

  const memories = [...(g.memories || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  detailMemories.innerHTML = memories.length
    ? memories
        .map((m) => `<div class="log-entry"><div class="log-meta">${escapeHtml(m.date)}</div>${escapeHtml(m.note || "")}</div>`)
        .join("")
    : `<p class="empty-hint">No memories saved yet.</p>`;

  $("session-date").value = new Date().toISOString().slice(0, 10);
  $("memory-date").value = new Date().toISOString().slice(0, 10);
}

$("session-add-btn").addEventListener("click", async () => {
  const g = games.find((x) => x.id === detailGameId);
  if (!g) return;
  const date = $("session-date").value || new Date().toISOString().slice(0, 10);
  const minutes = Number($("session-minutes").value) || 0;
  const note = $("session-note").value.trim();
  if (!minutes && !note) { showToast("Add a duration or a note."); return; }
  const sessions = [...(g.sessions || []), { id: genId(), date, minutes, note }];
  try {
    await saveGame(currentUser.uid, { id: g.id, sessions });
    $("session-minutes").value = "";
    $("session-note").value = "";
    showToast("Session logged.");
  } catch (e) {
    showToast(`Couldn't save session: ${e.message}`);
  }
});

$("memory-add-btn").addEventListener("click", async () => {
  const g = games.find((x) => x.id === detailGameId);
  if (!g) return;
  const date = $("memory-date").value || new Date().toISOString().slice(0, 10);
  const note = $("memory-note").value.trim();
  if (!note) { showToast("Write something to remember."); return; }
  const memories = [...(g.memories || []), { id: genId(), date, note }];
  try {
    await saveGame(currentUser.uid, { id: g.id, memories });
    $("memory-note").value = "";
    showToast("Memory saved.");
  } catch (e) {
    showToast(`Couldn't save memory: ${e.message}`);
  }
});

// ---------------------------------------------------------------------------
// Steam import
// ---------------------------------------------------------------------------

$("steam-import-btn").addEventListener("click", () => {
  steamPasteInput.value = "";
  steamBackdrop.hidden = false;
});
$("steam-modal-close").addEventListener("click", () => (steamBackdrop.hidden = true));
$("steam-cancel-btn").addEventListener("click", () => (steamBackdrop.hidden = true));
steamBackdrop.addEventListener("click", (e) => { if (e.target === steamBackdrop) steamBackdrop.hidden = true; });

$("steam-import-confirm-btn").addEventListener("click", async () => {
  let imported;
  try {
    imported = parseSteamLibrary(steamPasteInput.value.trim());
  } catch (e) {
    showToast(e.message);
    return;
  }

  const existingAppIds = new Set(games.map((g) => g.steamAppId).filter(Boolean));
  const toAdd = imported.filter((g) => !existingAppIds.has(g.steamAppId));
  const skipped = imported.length - toAdd.length;

  if (!toAdd.length) {
    showToast(skipped ? "All of those are already in your library." : "No games found in that JSON.");
    return;
  }

  try {
    await Promise.all(
      toAdd.map((g) => {
        const sessions = g.playtimeMinutes > 0
          ? [{ id: genId(), date: new Date().toISOString().slice(0, 10), minutes: g.playtimeMinutes, note: "Imported total playtime from Steam" }]
          : [];
        return saveGame(currentUser.uid, {
          title: g.title,
          platform: "PC",
          status: "backlog",
          tags: [],
          pricePaid: null,
          acquisition: "owned",
          priority: null,
          estimatedHours: null,
          rating: null,
          coverImage: g.coverImage,
          steamAppId: g.steamAppId,
          dateAdded: Date.now(),
          dateStarted: null,
          dateCompleted: null,
          sessions,
          memories: [],
          checklist: { story: false, hundred: false, achievements: false },
        });
      })
    );
    showToast(`Imported ${toAdd.length} game${toAdd.length === 1 ? "" : "s"}${skipped ? ` (${skipped} already in your library)` : ""}.`);
    steamBackdrop.hidden = true;
  } catch (e) {
    showToast(`Import failed: ${e.message}`);
  }
});

// ---------------------------------------------------------------------------
// PlayStation import
// ---------------------------------------------------------------------------

$("psn-import-btn").addEventListener("click", () => {
  psnPasteInput.value = "";
  psnBackdrop.hidden = false;
});
$("psn-modal-close").addEventListener("click", () => (psnBackdrop.hidden = true));
$("psn-cancel-btn").addEventListener("click", () => (psnBackdrop.hidden = true));
psnBackdrop.addEventListener("click", (e) => { if (e.target === psnBackdrop) psnBackdrop.hidden = true; });

$("psn-import-confirm-btn").addEventListener("click", async () => {
  let imported;
  try {
    imported = parsePlaystationLibrary(psnPasteInput.value.trim());
  } catch (e) {
    showToast(e.message);
    return;
  }

  const existingIds = new Set(games.map((g) => g.psnTitleId).filter(Boolean));
  const toAdd = imported.filter((g) => !existingIds.has(g.psnTitleId));
  const skipped = imported.length - toAdd.length;

  if (!toAdd.length) {
    showToast(skipped ? "All of those are already in your library." : "No games found in that JSON.");
    return;
  }

  try {
    await Promise.all(
      toAdd.map((g) => {
        const sessions = g.playtimeMinutes > 0
          ? [{ id: genId(), date: g.lastPlayedDate || new Date().toISOString().slice(0, 10), minutes: g.playtimeMinutes, note: "Imported total playtime from PlayStation" }]
          : [];
        return saveGame(currentUser.uid, {
          title: g.title,
          platform: g.platform,
          status: "backlog",
          tags: [],
          pricePaid: null,
          acquisition: "owned",
          priority: null,
          estimatedHours: null,
          rating: null,
          coverImage: g.coverImage,
          psnTitleId: g.psnTitleId,
          dateAdded: Date.now(),
          dateStarted: null,
          dateCompleted: null,
          sessions,
          memories: [],
          checklist: { story: false, hundred: false, achievements: false },
        });
      })
    );
    showToast(`Imported ${toAdd.length} game${toAdd.length === 1 ? "" : "s"}${skipped ? ` (${skipped} already in your library)` : ""}.`);
    psnBackdrop.hidden = true;
  } catch (e) {
    showToast(`Import failed: ${e.message}`);
  }
});

// ---------------------------------------------------------------------------
// Year in review
// ---------------------------------------------------------------------------

$("year-review-btn").addEventListener("click", () => {
  renderYearReview(new Date().getFullYear());
  yearBackdrop.hidden = false;
});
$("year-modal-close").addEventListener("click", () => (yearBackdrop.hidden = true));
yearBackdrop.addEventListener("click", (e) => { if (e.target === yearBackdrop) yearBackdrop.hidden = true; });

function renderYearReview(year) {
  yearModalTitle.textContent = `${year} in review`;

  const completed = games.filter(
    (g) => g.status === "completed" && g.dateCompleted && new Date(g.dateCompleted).getFullYear() === year
  );

  const sessionsThisYear = games.flatMap((g) =>
    (g.sessions || [])
      .filter((s) => s.date && new Date(s.date).getFullYear() === year)
      .map((s) => ({ ...s, game: g.title }))
  );
  const totalMinutes = sessionsThisYear.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0);

  const tagCounts = {};
  for (const g of games) {
    const touchedThisYear =
      (g.dateCompleted && new Date(g.dateCompleted).getFullYear() === year) ||
      (g.sessions || []).some((s) => s.date && new Date(s.date).getFullYear() === year);
    if (!touchedThisYear) continue;
    for (const t of g.tags || []) tagCounts[t] = (tagCounts[t] || 0) + 1;
  }
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ratedCompleted = completed.filter((g) => typeof g.rating === "number");
  const topRated = [...ratedCompleted].sort((a, b) => b.rating - a.rating).slice(0, 5);

  if (!completed.length && !sessionsThisYear.length) {
    yearReviewBody.innerHTML = `<p class="year-empty">Nothing logged for ${year} yet — play something and come back!</p>`;
    return;
  }

  yearReviewBody.innerHTML = `
    <div class="year-hero">
      <div class="big-number">${completed.length}</div>
      <div class="caption">game${completed.length === 1 ? "" : "s"} completed · ${formatMinutes(totalMinutes)} played</div>
    </div>
    ${topRated.length ? `
      <h3>Highest rated</h3>
      <div class="year-list">
        ${topRated.map((g) => `<div class="row"><span>${escapeHtml(g.title)}</span><span>★ ${g.rating}/10</span></div>`).join("")}
      </div>
    ` : ""}
    ${topTags.length ? `
      <h3 style="margin-top:16px">Most-played tags</h3>
      <div class="year-list">
        ${topTags.map(([t, c]) => `<div class="row"><span>${escapeHtml(t)}</span><span>${c} game${c === 1 ? "" : "s"}</span></div>`).join("")}
      </div>
    ` : ""}
  `;
}

// ---------------------------------------------------------------------------
// PWA: service worker
// ---------------------------------------------------------------------------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

