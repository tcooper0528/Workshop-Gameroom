import { createContext, useContext, useEffect, useState } from "react";
import { signInAnonymously, onAuthStateChanged, updateProfile } from "firebase/auth";
import { auth, firebaseReady } from "../firebase/config";
import { cleanNickname } from "../utils/nickname";

// ── Guest players, no accounts ────────────────────────────────
// Every visitor is signed in to Firebase *anonymously*: they get an
// invisible guest ID (so room codes, turns and scores work) but we
// never ask for an email, password, or any personal information.
// The only thing a player gives us is a nickname, saved on their
// own device by Firebase so it's still there next visit.

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [nickname, setNicknameState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setNicknameState(u.displayName || "");
        setLoading(false);
      } else {
        // No guest ID on this device yet. Make one.
        try {
          await signInAnonymously(auth);
        } catch (err) {
          console.error("Guest sign-in failed:", err);
          setError(
            "We couldn't connect to the game server. Check your internet and refresh the page."
          );
          setLoading(false);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Save (or change) the player's nickname.
  async function setNickname(raw) {
    const clean = cleanNickname(raw);
    if (!clean.ok) throw new Error(clean.reason);
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: clean.name });
    }
    setNicknameState(clean.name);
    return clean.name;
  }

  // Games only need a uid and a display name, so we hand them a
  // small plain object. It updates as soon as the nickname changes.
  const currentUser =
    user && nickname ? { uid: user.uid, displayName: nickname } : null;

  const value = {
    currentUser,
    guestId: user?.uid || null,
    nickname,
    setNickname,
    loading,
    error,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
