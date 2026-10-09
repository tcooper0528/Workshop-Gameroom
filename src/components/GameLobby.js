import { useState, useEffect } from "react";
import { collection, onSnapshot, query, where, getDocs, deleteDoc, limit } from "firebase/firestore";
import { db } from "../firebase/config";

// ── Shared tap-to-join lobby for all multiplayer games ────────
// Shows a live list of open rooms so players (especially little
// fingers!) can just tap a room instead of typing codes.
//
// Props:
//   collectionName - Firestore collection, e.g. "unoGames"
//   emoji          - game emoji for room rows, e.g. "🎴"
//   maxPlayers     - max players allowed in a room
//   onCreate       - async fn, creates a room (page handles it)
//   onJoin         - async fn(roomId), joins a room (page handles it)
//   loading        - true while the page is creating/joining
//   createLabel    - text for the create button
export default function GameLobby({
  collectionName,
  emoji,
  maxPlayers,
  onCreate,
  onJoin,
  loading,
  createLabel,
}) {
  const [rooms, setRooms] = useState([]);
  const [listError, setListError] = useState("");

  // Housekeeping: anyone opening a lobby quietly deletes up to 25
  // rooms that are more than a day old (finished, abandoned, or
  // stuck mid-game). The security rules only allow deleting rooms
  // older than 24 hours, so this can't touch a game in progress.
  useEffect(() => {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const stale = query(
      collection(db, collectionName),
      where("createdAt", "<", dayAgo),
      limit(25)
    );
    getDocs(stale)
      .then(snap => Promise.all(snap.docs.map(d => deleteDoc(d.ref).catch(() => {}))))
      .catch(err => console.warn("Old-room cleanup skipped:", err));
  }, [collectionName]);

  // Live list of rooms that are still waiting for players
  useEffect(() => {
    const q = query(
      collection(db, collectionName),
      where("status", "==", "waiting")
    );
    const unsub = onSnapshot(
      q,
      snap => {
        const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
        const open = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          // hide old abandoned rooms (rooms made before this update
          // have no createdAt, so they stay hidden too)
          .filter(r => (r.createdAt || 0) > twelveHoursAgo)
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setRooms(open);
        setListError("");
      },
      err => {
        console.error("Lobby list error:", err);
        setListError("⚠️ Couldn't load the room list. Check your internet connection.");
      }
    );
    return unsub;
  }, [collectionName]);

  return (
    <div>
      <button style={lobbyStyles.createBtn} onClick={onCreate} disabled={loading}>
        {loading ? "Working..." : createLabel}
      </button>

      <div style={lobbyStyles.divider}>— or tap a room to join —</div>

      {listError && <div style={lobbyStyles.error}>{listError}</div>}

      {!listError && rooms.length === 0 && (
        <div style={lobbyStyles.empty}>
          No open rooms right now.
          <br />
          Be the first — create one! 🎉
        </div>
      )}

      {rooms.map(room => {
        const hostName = room.playerNames?.[room.host] || "Someone";
        const count = room.players?.length || 0;
        const full = count >= maxPlayers;
        return (
          <button
            key={room.id}
            style={{
              ...lobbyStyles.roomRow,
              ...(full ? lobbyStyles.roomRowFull : {}),
            }}
            onClick={() => !full && !loading && onJoin(room.id)}
            disabled={full || loading}
          >
            <span style={lobbyStyles.roomEmoji}>{emoji}</span>
            <span style={lobbyStyles.roomInfo}>
              <span style={lobbyStyles.roomName}>{hostName}'s Room</span>
              <span style={lobbyStyles.roomCount}>
                {count}/{maxPlayers} players
              </span>
            </span>
            <span style={lobbyStyles.roomAction}>
              {full ? "Full" : "Join ▶"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const lobbyStyles = {
  createBtn: {
    width: "100%",
    padding: "16px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #1D9E75, #0F6E56)",
    color: "white",
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
  },
  divider: {
    textAlign: "center",
    margin: "16px 0",
    color: "var(--text-secondary)",
    fontSize: 13,
  },
  empty: {
    textAlign: "center",
    padding: "20px 12px",
    color: "var(--text-secondary)",
    fontSize: 14,
    lineHeight: 1.6,
    background: "var(--bg)",
    borderRadius: 12,
    border: "1px dashed var(--border)",
  },
  error: {
    textAlign: "center",
    padding: "12px",
    borderRadius: 10,
    background: "#FFF3F3",
    color: "#C62828",
    fontSize: 13,
    marginBottom: 10,
  },
  roomRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    width: "100%",
    padding: "14px 16px",
    marginBottom: 10,
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "var(--card-bg, white)",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 15,
  },
  roomRowFull: {
    opacity: 0.5,
    cursor: "not-allowed",
  },
  roomEmoji: {
    fontSize: 26,
  },
  roomInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  roomName: {
    fontWeight: 700,
    color: "var(--text)",
  },
  roomCount: {
    fontSize: 12,
    color: "var(--text-secondary)",
  },
  roomAction: {
    fontWeight: 700,
    color: "#1D9E75",
    fontSize: 14,
    whiteSpace: "nowrap",
  },
};
