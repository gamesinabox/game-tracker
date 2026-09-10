// Sony has no public API, so this parses the JSON produced by psn-export.js — a
// small Node script the user runs themselves (see the "Import from PlayStation"
// modal for instructions). Mirrors steam.js's shape/approach.

const CATEGORY_PLATFORM = {
  ps5_native_game: "PS5",
  ps4_game: "PS4",
  ps3_game: "PS3",
  psvita_game: "PS Vita",
  pspc_game: "PC",
};

function platformFromCategory(category) {
  return CATEGORY_PLATFORM[category] || "PlayStation";
}

// Converts an ISO 8601 duration like "PT12H34M56S" (psn-export.js's playDuration) to minutes.
function parseDurationMinutes(iso) {
  if (!iso) return 0;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const hours = Number(m[1] || 0);
  const minutes = Number(m[2] || 0);
  const seconds = Number(m[3] || 0);
  return hours * 60 + minutes + Math.round(seconds / 60);
}

// PSN's game list (titleId) and trophy list (npCommunicationId) use unrelated id systems with
// no public crosswalk, so trophies are matched to games by normalized title name — best-effort,
// not exact for every edge case (regional re-releases, demos, etc.).
function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function trophiesFromTitle(t) {
  if (!t) return null;
  return {
    bronze: t.earnedTrophies?.bronze || 0,
    bronzeTotal: t.definedTrophies?.bronze || 0,
    silver: t.earnedTrophies?.silver || 0,
    silverTotal: t.definedTrophies?.silver || 0,
    gold: t.earnedTrophies?.gold || 0,
    goldTotal: t.definedTrophies?.gold || 0,
    platinum: t.earnedTrophies?.platinum || 0,
    platinumTotal: t.definedTrophies?.platinum || 0,
    progress: t.progress || 0,
  };
}

export function parsePlaystationLibrary(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("That doesn't look like valid JSON.");
  }
  const list = data?.titles;
  if (!Array.isArray(list)) {
    throw new Error('Expected a {"titles":[...]} object — the file psn-export.js writes.');
  }

  const trophiesByName = new Map();
  for (const t of data?.trophyTitles || []) {
    const key = normalizeName(t.trophyTitleName);
    if (key && !trophiesByName.has(key)) trophiesByName.set(key, t);
  }

  return list.map((g) => {
    const title = g.localizedName || g.name || `PlayStation title ${g.titleId}`;
    return {
      psnTitleId: g.titleId,
      title,
      coverImage: g.localizedImageUrl || g.imageUrl || null,
      platform: platformFromCategory(g.category),
      playtimeMinutes: parseDurationMinutes(g.playDuration),
      lastPlayedDate: g.lastPlayedDateTime ? g.lastPlayedDateTime.slice(0, 10) : null,
      trophies: trophiesFromTitle(trophiesByName.get(normalizeName(title))),
    };
  });
}
