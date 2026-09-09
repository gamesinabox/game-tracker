// Steam's Web API has no CORS headers, so a page like this can't fetch it
// directly. Instead the user opens the API URL themselves (a normal
// top-level navigation, which isn't CORS-restricted) and pastes the JSON
// response here.
export function parseSteamLibrary(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("That doesn't look like valid JSON.");
  }
  const list = data?.response?.games;
  if (!Array.isArray(list)) {
    throw new Error('Expected a {"response":{"games":[...]}} object from the Steam API.');
  }
  return list.map((g) => ({
    steamAppId: g.appid,
    title: g.name || `Steam app ${g.appid}`,
    coverImage: g.appid ? `https://cdn.akamai.steamstatic.com/steam/apps/${g.appid}/header.jpg` : null,
    playtimeMinutes: Number(g.playtime_forever) || 0,
  }));
}
