import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// ── Workshop Gameroom's own Firebase project ─────────────────
// This is a SEPARATE project from the family hub, so nothing here
// can ever see family accounts, photos, or messages.
//
// Paste the config from Firebase console → Project settings →
// Your apps → Web app → "SDK setup and configuration" → Config.
// (These values are safe to be public. The security rules in
// firestore.rules are what protect the data.)
const firebaseConfig = {
  apiKey: "AIzaSyDR5HSFBO0JGQH6GzK0zV230sHgFAwUcWw",
  authDomain: "workshop-gameroom-40941.firebaseapp.com",
  projectId: "workshop-gameroom-40941",
  storageBucket: "workshop-gameroom-40941.firebasestorage.app",
  messagingSenderId: "971674899059",
  appId: "1:971674899059:web:a27ccf012a668d5ddb1006",
};

// True once real values are pasted in above. Until then the site
// shows a friendly "not set up yet" message instead of crashing.
export const firebaseReady = !firebaseConfig.apiKey.startsWith("PASTE_");

const app = firebaseReady ? initializeApp(firebaseConfig) : null;

export const auth = app ? getAuth(app) : null;

// Long polling keeps turns and room joins quick on networks that
// stall Firestore's default connection (carried over from the family hub).
export const db = app
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : null;

export default app;
