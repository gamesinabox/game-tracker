import { RAWG_API_KEY } from "./config.js";

export function rawgConfigured() {
  return Boolean(RAWG_API_KEY) && !RAWG_API_KEY.startsWith("YOUR_");
}

export async function searchGames(query) {
  if (!query || !rawgConfigured()) return [];
  const url = `https://api.rawg.io/api/games?key=${encodeURIComponent(
    RAWG_API_KEY
  )}&search=${encodeURIComponent(query)}&page_size=6`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results || []).map((g) => ({
    rawgId: g.id,
    title: g.name,
    coverImage: g.background_image || null,
    released: g.released || null,
    platforms: (g.platforms || []).map((p) => p.platform.name),
    genres: (g.genres || []).map((x) => x.name),
  }));
}
