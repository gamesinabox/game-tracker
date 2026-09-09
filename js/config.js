// Fill these in with your own project's values — see README.md for how to get them.
// Firebase web config is not a secret; it's safe to commit. Firestore security rules
// are what actually protect your data (see README.md).
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Free key from https://rawg.io/apidocs — used client-side to search for games and
// pull cover art. If your GitHub repo is public, this key is visible to anyone; RAWG's
// free tier is rate-limited per key, not billed, so the worst case is your quota
// getting used up. Make the repo private if you'd rather avoid that.
export const RAWG_API_KEY = "YOUR_RAWG_API_KEY";
