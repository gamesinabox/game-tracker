# Backlog

A personal game tracker: backlog, ratings, tags, session notes, and memories,
synced across every device via Firebase.

## One-time setup

You need three free things: a Firebase project (auth + database), a RAWG API
key (cover art + search), and GitHub Pages (hosting). None of this costs
money at this app's scale.

### 1. Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → give it any name.
2. In the project, click the **web** icon (`</>`) to register a new web app. Skip Firebase Hosting when it's offered — you're using GitHub Pages instead.
3. Copy the `firebaseConfig` object it shows you into [`js/config.js`](js/config.js), replacing the placeholder values.
4. In the left sidebar: **Build → Authentication → Get started**. Under **Sign-in method**, enable **Google**.
5. Still in Authentication, go to **Settings → Authorized domains** and add `<your-github-username>.github.io` (you'll set this up in step 4 below).
6. In the left sidebar: **Build → Firestore Database → Create database**. Start in **production mode**, pick any region.
7. Go to the **Rules** tab and replace the contents with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

   This means: you can only ever read or write your own data, and only when
   signed in. Click **Publish**.

### 2. RAWG API key (cover art + game search)

1. Go to [rawg.io/apidocs](https://rawg.io/apidocs) and sign up for a free API key.
2. Paste it into `RAWG_API_KEY` in [`js/config.js`](js/config.js).

If you skip this, the app still works fully — you just won't get search
autocomplete or real cover art, and games will show a generated color tile
instead.

### 3. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create game-tracker --private --source=. --push
```

(Or create the repo on github.com and `git remote add origin ...` +
`git push` if you don't have the `gh` CLI.)

### 4. Enable GitHub Pages

1. On the repo's GitHub page: **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to `Deploy from a branch`, branch `main`, folder `/ (root)`.
3. Save. After a minute your app is live at `https://<your-username>.github.io/game-tracker/`.
4. Go back to Firebase → Authentication → Settings → Authorized domains and confirm that exact `github.io` domain is listed (step 1.5 above).

### 5. Use it

Open the Pages URL, sign in with Google, and start adding games. Every
device you sign in on (phone, laptop, whatever) sees the same library.

## Notes on privacy

- Firebase's web config (`js/config.js`) is not a secret — it's meant to be
  public. Your data is protected by the Firestore security rule above, not
  by hiding the config.
- The RAWG key is a little more sensitive: if your repo is public, anyone
  can see and use it (RAWG's free tier is rate-limited, not billed, so the
  worst case is your quota getting used up). Make the repo private if that
  bothers you — GitHub Pages works fine on private repos.

## Local development

No build step — it's plain HTML/CSS/JS with ES modules. Serve the folder
with any static server, e.g.:

```bash
python3 -m http.server 8000
```

then open `http://localhost:8000`. (Opening `index.html` directly via
`file://` won't work — ES modules require a real HTTP origin.) Note that
Firebase Auth's authorized domains list needs `localhost` too, which it
includes by default.
