import { auth, watchAuth, signIn, signOutUser, watchGames, saveGame, deleteGame } from "./firebase.js";
import { searchGames, rawgConfigured } from "./rawg.js";

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

const filters = { search: "", status: "all", platform: "all", tag: "all", sort: "added-desc" };

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
const spotlightRow = $("spotlight-row");
const spotlightEmpty = $("spotlight-empty");
const pickerResult = $("picker-result");

const gameGrid = $("game-grid");
const libraryEmpty = $("library-empty");
const filterSearch = $("filter-search");
const filterStatus = $("filter-status");
const filterPlatform = $("filter-platform");
const filterTag = $("filter-tag");
const filterSort = $("filter-sort");

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
const editDeleteBtn = $("edit-delete-btn");

const detailBackdrop = $("detail-modal-backdrop");
const detailCover = $("detail-cover");
const detailTitle = $("detail-title");
const detailMeta = $("detail-meta");
const detailStars = $("detail-stars");
const detailTags = $("detail-tags");
const detailSessions = $("detail-sessions");
const detailMemories = $("detail-memories");

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
    userAvatar.src = user.photoURL || "";
    userName.textContent = user.displayName || user.email || "";
    unsubscribeGames = watchGames(
      user.uid,
      (list) => {
        games = list;
        renderAll();
      },
      (err) => showToast(`Sync error: ${err.message}`)
    );
  } else {
    signedOutEl.hidden = false;
    appEl.hidden = true;
    games = [];
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
  renderSpotlight();
  renderFilterOptions();
  renderLibrary();
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
  ];

  statGrid.innerHTML = tiles
    .map(
      (t) => `<div class="stat-tile"><div class="value">${escapeHtml(String(t.value))}</div><div class="label">${escapeHtml(t.label)}</div></div>`
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Dashboard: currently playing spotlight
// ---------------------------------------------------------------------------

function renderSpotlight() {
  const playing = games.filter((g) => g.status === "playing");
  spotlightEmpty.hidden = playing.length > 0;
  spotlightRow.innerHTML = playing
    .map((g) => {
      const sessions = g.sessions || [];
      const last = sessions.length ? sessions[sessions.length - 1] : null;
      const stale = last && daysSince(new Date(last.date).getTime()) > 14;
      const metaLine = last
        ? `${stale ? '<span class="stale-flag">⚠ stale — </span>' : ""}last played ${escapeHtml(last.date)}`
        : "no sessions logged yet";
      return `
        <div class="spotlight-card" data-id="${g.id}">
          <div class="cover" style="${coverBackground(g)}"></div>
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

function renderLibrary() {
  let list = games.filter((g) => {
    if (filters.search && !g.title.toLowerCase().includes(filters.search)) return false;
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

  libraryEmpty.hidden = list.length > 0;
  gameGrid.innerHTML = list
    .map((g) => {
      const ratingBadge = typeof g.rating === "number" ? `<span class="rating-badge">★ ${g.rating}/10</span>` : "";
      const tagRow = (g.tags || [])
        .slice(0, 3)
        .map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`)
        .join("");
      return `
        <div class="game-card" data-id="${g.id}">
          <div class="cover" style="${coverBackground(g)}">
            <span class="status-pill">${escapeHtml(g.status)}</span>
            <span class="platform-icon">${platformIcon(g.platform)}</span>
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
  gameGrid.querySelectorAll(".game-card").forEach((el) =>
    el.addEventListener("click", () => openDetailModal(el.dataset.id))
  );
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
    rating: existing?.rating ?? null,
    sessions: existing?.sessions || [],
    memories: existing?.memories || [],
    dateAdded: existing?.dateAdded || Date.now(),
    dateStarted: existing?.dateStarted || null,
    dateCompleted: existing?.dateCompleted || null,
    coverImage: editingRawgPick?.coverImage ?? existing?.coverImage ?? null,
    rawgId: editingRawgPick?.rawgId ?? existing?.rawgId ?? null,
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
