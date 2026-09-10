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
  return list.map((g) => ({
    psnTitleId: g.titleId,
    title: g.localizedName || g.name || `PlayStation title ${g.titleId}`,
    coverImage: g.localizedImageUrl || g.imageUrl || null,
    platform: platformFromCategory(g.category),
    playtimeMinutes: parseDurationMinutes(g.playDuration),
    lastPlayedDate: g.lastPlayedDateTime ? g.lastPlayedDateTime.slice(0, 10) : null,
  }));
}
