#!/usr/bin/env node
// One-time export of your PlayStation library (via Sony's unofficial API — the same
// one PSN mobile apps use, not something Sony publishes for public use) into a JSON
// file you paste into Backlog's "Import from PlayStation" screen. Requires Node.js 18+.
//
// Usage:
//   1. Log into https://playstation.com in a browser.
//   2. In the SAME browser, visit https://ca.account.sony.com/api/v1/ssocookie — it
//      shows JSON like {"npsso":"<64 character token>"}. Copy just the token string.
//      It expires in about an hour, so run this script soon after copying it.
//   3. Run: node psn-export.js YOUR_NPSSO_TOKEN
//   4. It writes psn-library.json in this folder. Open it, copy the contents, and
//      paste them into the "Import from PlayStation" screen in the app.
//
// This talks to an unofficial, reverse-engineered API — Sony could change or break
// it at any time without notice. If it stops working, that's most likely why.

const AUTH_BASE_URL = "https://ca.account.sony.com/api/authz/v3/oauth";
const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
const BASIC_AUTH =
  "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=";
const REDIRECT_URI = "com.scee.psxandroid.scecompcall://redirect";
const GAMES_URL = "https://m.np.playstation.com/api/gamelist/v2/users/me/titles";

const npsso = process.argv[2];
if (!npsso) {
  console.error("Usage: node psn-export.js YOUR_NPSSO_TOKEN");
  console.error("\nGet a token by logging into playstation.com, then in the same");
  console.error("browser visiting https://ca.account.sony.com/api/v1/ssocookie");
  process.exit(1);
}

async function exchangeNpssoForCode(npssoToken) {
  const params = new URLSearchParams({
    access_type: "offline",
    client_id: CLIENT_ID,
    scope: "psn:mobile.v2.core psn:clientapp",
    redirect_uri: REDIRECT_URI,
    response_type: "code",
  });
  const res = await fetch(`${AUTH_BASE_URL}/authorize?${params}`, {
    headers: { Cookie: `npsso=${npssoToken}` },
    redirect: "manual",
  });
  const location = res.headers.get("location");
  if (!location || !location.includes("?code=")) {
    throw new Error(
      "Couldn't get an access code — your NPSSO token is probably expired or wrong " +
        "(they only last about an hour). Get a fresh one from " +
        "https://ca.account.sony.com/api/v1/ssocookie and try again."
    );
  }
  return new URL(location).searchParams.get("code");
}

async function exchangeCodeForToken(code) {
  const res = await fetch(`${AUTH_BASE_URL}/token`, {
    method: "POST",
    headers: {
      Authorization: BASIC_AUTH,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      token_format: "jwt",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Token exchange failed: " + JSON.stringify(data));
  }
  return data.access_token;
}

async function fetchAllTitles(accessToken) {
  const titles = [];
  const limit = 200;
  let offset = 0;
  for (;;) {
    const url = `${GAMES_URL}?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
    const data = await res.json();
    if (!Array.isArray(data.titles)) {
      throw new Error(
        "Unexpected response from PlayStation: " + JSON.stringify(data).slice(0, 300)
      );
    }
    titles.push(...data.titles);
    console.log(
      `Fetched ${titles.length}${data.totalItemCount ? ` / ${data.totalItemCount}` : ""} games...`
    );
    if (!data.nextOffset || data.titles.length < limit) break;
    offset = data.nextOffset;
  }
  return titles;
}

async function main() {
  console.log("Exchanging NPSSO for an access code...");
  const code = await exchangeNpssoForCode(npsso);
  console.log("Exchanging code for an access token...");
  const accessToken = await exchangeCodeForToken(code);
  console.log("Fetching your game library...");
  const titles = await fetchAllTitles(accessToken);

  const fs = await import("node:fs");
  fs.writeFileSync("psn-library.json", JSON.stringify({ titles }, null, 2));
  console.log(`\nDone! Saved ${titles.length} games to psn-library.json`);
  console.log(
    'Open that file, copy its contents, and paste them into the "Import from ' +
      'PlayStation" screen in the app.'
  );
}

main().catch((err) => {
  console.error("\nSomething went wrong:", err.message);
  process.exit(1);
});
