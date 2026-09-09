import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// Lets the app keep working (read-only, queued writes) when offline, and
// makes reloads instant from local cache. Fails harmlessly in browsers/tabs
// that don't support it (e.g. a second tab open at once).
enableIndexedDbPersistence(db).catch(() => {});

export function signIn() {
  return signInWithPopup(auth, provider);
}

export function signOutUser() {
  return signOut(auth);
}

export function watchAuth(cb) {
  return onAuthStateChanged(auth, cb);
}

function gamesCollection(uid) {
  return collection(db, "users", uid, "games");
}

export function watchGames(uid, cb, onError) {
  const q = query(gamesCollection(uid), orderBy("dateAdded", "desc"));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export async function saveGame(uid, game) {
  const ref = game.id
    ? doc(db, "users", uid, "games", game.id)
    : doc(gamesCollection(uid));
  const { id, ...data } = game;
  await setDoc(ref, data, { merge: true });
  return ref.id;
}

export async function deleteGame(uid, gameId) {
  await deleteDoc(doc(db, "users", uid, "games", gameId));
}
