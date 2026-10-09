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
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
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
