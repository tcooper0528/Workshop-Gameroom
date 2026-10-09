import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { randomNickname } from "../utils/nickname";

// First thing a new visitor sees: pick a nickname, then play.
// Also used from the navbar to change your name later.
export default function Nickname({ onDone, onCancel }) {
  const { nickname, setNickname } = useAuth();
  const [name, setName] = useState(nickname || randomNickname());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await setNickname(name);
      onDone && onDone();
    } catch (err) {
      setError(err.message || "Couldn't save that name. Try again!");
    }
    setSaving(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ fontSize: 44, textAlign: "center" }}>🎮</div>
        <div className="auth-title">
          {nickname ? "Change your name" : "Welcome to Workshop Gameroom!"}
        </div>
        <div className="auth-subtitle">
          Pick a fun name, or type your own. That's all you need to play. No sign-up,
          no email.
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-label" htmlFor="nickname">Your player name</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="nickname"
              className="input"
              type="text"
              value={name}
              maxLength={16}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              title="Give me a random fun name"
              aria-label="Random name"
              onClick={() => { setName(randomNickname()); setError(""); }}
              style={{ fontSize: 20, padding: "0 14px" }}
            >
              🎲
            </button>
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Tip: don't use your real full name. Other players will see it.
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn btn-primary btn-full" type="submit" disabled={saving}>
            {saving ? "Saving..." : nickname ? "Save name" : "Let's play! ▶"}
          </button>
          {onCancel && (
            <button type="button" className="btn btn-ghost btn-full" onClick={onCancel}>
              Cancel
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
