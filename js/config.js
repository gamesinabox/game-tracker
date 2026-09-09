// Fill these in with your own project's values — see README.md for how to get them.
// Firebase web config is not a secret; it's safe to commit. Firestore security rules
// are what actually protect your data (see README.md).
export const firebaseConfig = {
  apiKey: "AIzaSyDQNOSoLWtvHppWIFpRdWkdYBNv9Xis_Jw",
  authDomain: "backlog-game-tracker.firebaseapp.com",
  projectId: "backlog-game-tracker",
  storageBucket: "backlog-game-tracker.firebasestorage.app",
  messagingSenderId: "884145132695",
  appId: "1:884145132695:web:b081f4c1526752779005d2",
};

// Free key from https://rawg.io/apidocs — used client-side to search for games and
// pull cover art. If your GitHub repo is public, this key is visible to anyone; RAWG's
// free tier is rate-limited per key, not billed, so the worst case is your quota
// getting used up. Make the repo private if you'd rather avoid that.
export const RAWG_API_KEY = "4d06c6cbada44e70b1f6d624e2798fbe";
