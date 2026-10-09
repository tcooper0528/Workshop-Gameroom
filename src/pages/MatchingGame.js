import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import GameLobby from "../components/GameLobby";
import CardBack from "../components/CardBack";

const ALL_CARDS = [
  { id: "go",     label: "GO",     img: "/cards/go.jpg" },
  { id: "help",   label: "HELP",   img: "/cards/help.jpg" },
  { id: "jump",   label: "JUMP",   img: "/cards/jump.jpg" },
  { id: "look",   label: "LOOK",   img: "/cards/look.jpg" },
  { id: "make",   label: "MAKE",   img: "/cards/make.jpg" },
  { id: "play",   label: "PLAY",   img: "/cards/play.jpg" },
  { id: "run",    label: "RUN",    img: "/cards/run.jpg" },
  { id: "little", label: "LITTLE", img: "/cards/little.jpg" },
  { id: "red",    label: "RED",    img: "/cards/red.jpg" },
  { id: "yellow", label: "YELLOW", img: "/cards/yellow.jpg" },
  { id: "funny",  label: "FUNNY",  img: "/cards/funny.jpg" },
  { id: "in",     label: "IN",     img: "/cards/in.jpg" },
  { id: "up",     label: "UP",     img: "/cards/up.jpg" },
  { id: "here",   label: "HERE",   img: "/cards/here.jpg" },
  { id: "is",     label: "IS",     img: "/cards/is.jpg" },
  { id: "not",    label: "NOT",    img: "/cards/not.jpg" },
  { id: "big",    label: "BIG",    img: "/cards/big.jpg" },
  { id: "small",  label: "SMALL",  img: "/cards/small.jpg" },
  { id: "happy",  label: "HAPPY",  img: "/cards/happy.jpg" },
  { id: "fast",   label: "FAST",   img: "/cards/fast.jpg" },
  { id: "stop",   label: "STOP",   img: "/cards/stop.jpg" },
  { id: "down",   label: "DOWN",   img: "/cards/down.jpg" },
  { id: "yes",    label: "YES",    img: "/cards/yes.jpg" },
];

const LEVELS = [
  { level: 1, pairs: 3,  label: "Level 1", desc: "6 cards · 3 pairs" },
  { level: 2, pairs: 4,  label: "Level 2", desc: "8 cards · 4 pairs" },
  { level: 3, pairs: 5,  label: "Level 3", desc: "10 cards · 5 pairs" },
  { level: 4, pairs: 6,  label: "Level 4", desc: "12 cards · 6 pairs" },
  { level: 5, pairs: 7,  label: "Level 5", desc: "14 cards · 7 pairs" },
  { level: 6, pairs: 8,  label: "Level 6", desc: "16 cards · 8 pairs" },
  { level: 7, pairs: 9,  label: "Level 7", desc: "18 cards · 9 pairs" },
  { level: 8, pairs: 10, label: "Level 8", desc: "20 cards · 10 pairs" },
];

const COLORS = ["#533AB7", "#1D9E75", "#D4537E", "#BA7517"];

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildDeck(pairs) {
  const selected = ALL_CARDS.slice(0, pairs);
  const deck = [];
  selected.forEach((card, i) => {
    deck.push({ ...card, uid: `${card.id}-a`, pairId: i });
    deck.push({ ...card, uid: `${card.id}-b`, pairId: i });
  });
  return shuffle(deck);
}

export default function MatchingGame({ onExit }) {
  const { currentUser } = useAuth();
  const uid = currentUser.uid;
  const name = currentUser.displayName || "Player";

  const [screen, setScreen] = useState("menu");
  const [level, setLevel] = useState(1);
  const [roomId, setRoomId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [game, setGame] = useState(null);

  const [soloDeck, setSoloDeck] = useState([]);
  const [soloFlipped, setSoloFlipped] = useState([]);
  const [soloMatched, setSoloMatched] = useState([]);
  const [soloMoves, setSoloMoves] = useState(0);
  const [soloBusy, setSoloBusy] = useState(false);
  const [soloTime, setSoloTime] = useState(0);
  const [soloRunning, setSoloRunning] = useState(false);
  const [soloWon, setSoloWon] = useState(false);

  useEffect(() => {
    if (!soloRunning) return;
    const t = setInterval(() => setSoloTime(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [soloRunning]);

  useEffect(() => {
    if (!roomId) return;
    const gameRef = doc(db, "matchingGames", roomId);
    const unsub = onSnapshot(gameRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setGame(data);
        if (data.status === "playing") setScreen("game");
        if (data.status === "waiting") setScreen("waiting");
      } else {
        setGame(null);
        setRoomId(null);
        setScreen("lobby");
        showMsg("The host closed that room.");
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  function showMsg(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  }

  // Start a solo game. Pass a level number to jump to that level;
  // otherwise it uses the level picked on the menu. Anything that isn't a
  // valid level number (like a button click event) is safely ignored.
  function startSolo(lvl) {
    const lv = Number.isInteger(lvl) && lvl >= 1 && lvl <= LEVELS.length ? lvl : level;
    setLevel(lv);
    const deck = buildDeck(LEVELS[lv - 1].pairs);
    setSoloDeck(deck);
    setSoloFlipped([]);
    setSoloMatched([]);
    setSoloMoves(0);
    setSoloTime(0);
    setSoloRunning(true);
    setSoloWon(false);
    setScreen("solo");
  }

  function handleSoloFlip(card) {
    if (soloBusy) return;
    if (soloMatched.includes(card.pairId)) return;
    if (soloFlipped.some(c => c.uid === card.uid)) return;
    if (soloFlipped.length >= 2) return;

    const newFlipped = [...soloFlipped, card];
    setSoloFlipped(newFlipped);
    if (newFlipped.length < 2) return;

    // Two cards are now face-up — resolve the turn.
    setSoloMoves(m => m + 1);
    setSoloBusy(true);
    const isMatch = newFlipped[0].pairId === newFlipped[1].pairId;
    const totalPairs = LEVELS[level - 1].pairs; // level is set by startSolo

    setTimeout(() => {
      if (isMatch) {
        // Functional update + de-dupe guard so the win check can't be missed.
        setSoloMatched(prev => {
          const updated = prev.includes(newFlipped[0].pairId)
            ? prev
            : [...prev, newFlipped[0].pairId];
          if (updated.length >= totalPairs) {
            setSoloRunning(false);
            setSoloWon(true);
          }
          return updated;
        });
      }
      setSoloFlipped([]);
      setSoloBusy(false);
    }, isMatch ? 700 : 1000);
  }

  async function createGame() {
    setLoading(true);
    try {
      const id = "MATCH-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      const deck = buildDeck(LEVELS[level - 1].pairs);
      await setDoc(doc(db, "matchingGames", id), {
        players: [uid],
        playerNames: { [uid]: name },
        status: "waiting",
        host: uid,
        createdAt: Date.now(),
        level,
        deck: deck.map(c => c.uid),
        deckData: JSON.stringify(deck),
        flipped: [],
        matched: [],
        scores: { [uid]: 0 },
        currentPlayerIndex: 0,
        lastFlipped: [],
        winner: null,
        lastAction: null,
      });
      setRoomId(id);
    } catch (err) {
      console.error("Create room failed:", err);
      showMsg("❌ Couldn't create the room. Check your internet and try again!");
    }
    setLoading(false);
  }

  async function joinRoom(id) {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, "matchingGames", id));
      if (!snap.exists()) { showMsg("❌ That room just closed. Pick another!"); setLoading(false); return; }
      const data = snap.data();
      if (data.players.includes(uid)) { setRoomId(id); setLoading(false); return; }
      if (data.players.length >= 4) { showMsg("❌ That room is full!"); setLoading(false); return; }
      if (data.status !== "waiting") { showMsg("❌ That game already started!"); setLoading(false); return; }
      await updateDoc(doc(db, "matchingGames", id), {
        players: [...data.players, uid],
        playerNames: { ...data.playerNames, [uid]: name },
        scores: { ...data.scores, [uid]: 0 },
      });
      setRoomId(id);
    } catch (err) {
      console.error("Join room failed:", err);
      showMsg("❌ Couldn't join the room. Check your internet and try again!");
    }
    setLoading(false);
  }

  async function leaveWaitingRoom() {
    const id = roomId;
    setRoomId(null);
    setGame(null);
    setScreen("lobby");
    try {
      if (!id || !game) return;
      const gameRef = doc(db, "matchingGames", id);
      if (game.host === uid) {
        await deleteDoc(gameRef);
      } else {
        const newPlayers = game.players.filter(p => p !== uid);
        const newNames = { ...game.playerNames };
        delete newNames[uid];
        const newScores = { ...game.scores };
        delete newScores[uid];
        await updateDoc(gameRef, { players: newPlayers, playerNames: newNames, scores: newScores });
      }
    } catch (err) {
      console.error("Leave room cleanup failed:", err);
    }
  }

  async function startMultiplayer() {
    if (!game || game.players.length < 2) { showMsg("Need at least 2 players!"); return; }
    setLoading(true);
    await updateDoc(doc(db, "matchingGames", roomId), { status: "playing" });
    setLoading(false);
  }

  async function handleMultiFlip(cardUid) {
    if (!game || game.status !== "playing") return;
    const isMyTurn = game.players[game.currentPlayerIndex] === uid;
    if (!isMyTurn) { showMsg("It's not your turn!"); return; }
    if (game.matched.includes(cardUid)) return;
    if (game.lastFlipped.includes(cardUid)) return;
    if (game.lastFlipped.length >= 2) return;

    const deck = JSON.parse(game.deckData);
    const newFlipped = [...game.lastFlipped, cardUid];

    if (newFlipped.length === 2) {
      const card1 = deck.find(c => c.uid === newFlipped[0]);
      const card2 = deck.find(c => c.uid === newFlipped[1]);
      const isMatch = card1.pairId === card2.pairId;

      if (isMatch) {
        const newMatched = [...game.matched, card1.uid, card2.uid];
        const newScores = { ...game.scores, [uid]: (game.scores[uid] || 0) + 1 };
        const allPairs = LEVELS[game.level - 1].pairs;

        if (newMatched.length / 2 >= allPairs) {
          const winnerId = Object.entries(newScores).sort((a, b) => b[1] - a[1])[0][0];
          await updateDoc(doc(db, "matchingGames", roomId), {
            lastFlipped: [],
            matched: newMatched,
            scores: newScores,
            status: "finished",
            winner: winnerId,
            lastAction: `${name} found a match! 🎉`,
          });
        } else {
          await updateDoc(doc(db, "matchingGames", roomId), {
            lastFlipped: [],
            matched: newMatched,
            scores: newScores,
            lastAction: `${name} found a match! 🎉`,
          });
        }
      } else {
        const nextIndex = (game.currentPlayerIndex + 1) % game.players.length;
        await updateDoc(doc(db, "matchingGames", roomId), {
          lastFlipped: newFlipped,
          lastAction: `${name} flipped...`,
        });
        setTimeout(async () => {
          await updateDoc(doc(db, "matchingGames", roomId), {
            lastFlipped: [],
            currentPlayerIndex: nextIndex,
          });
        }, 1000);
      }
    } else {
      await updateDoc(doc(db, "matchingGames", roomId), {
        lastFlipped: newFlipped,
        lastAction: `${name} flipped a card...`,
      });
    }
  }

  function formatTime(sec) {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  // ── Menu ──────────────────────────────────────────────────
  if (screen === "menu") {
    return (
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={onExit} style={s.backBtn}>← Exit</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>🎴</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Matching Game</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>Flip cards to find pairs!</div>
          </div>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ maxWidth: 500, margin: "0 auto", padding: "0 16px 40px" }}>
          {message && <div style={s.message}>{message}</div>}
          <div style={s.card}>
            <div style={s.cardTitle}>🎯 Choose Your Level</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {LEVELS.map(l => (
                <div key={l.level} onClick={() => setLevel(l.level)}
                  style={{
                    padding: "12px 10px", borderRadius: 12, cursor: "pointer",
                    textAlign: "center", transition: "all 0.15s",
                    background: level === l.level ? "#533AB7" : "var(--bg)",
                    color: level === l.level ? "white" : "var(--text)",
                    border: level === l.level ? "none" : "1px solid var(--border)",
                    boxShadow: level === l.level ? "0 4px 12px rgba(83,58,183,0.3)" : "none",
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{l.label}</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 3 }}>{l.desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={s.card}>
            <div style={s.cardTitle}>🎮 How do you want to play?</div>
            <button style={{ ...s.btnPrimary, marginBottom: 12 }} onClick={() => startSolo()}>
              🧩 Play Solo
            </button>
            <div style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
              — or play with friends —
            </div>
            <button style={s.btnGreen} onClick={() => setScreen("lobby")}>
              👥 Play with Friends
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Solo Game ─────────────────────────────────────────────
  if (screen === "solo") {
    const pairs = LEVELS[level - 1].pairs;
    const cols = pairs <= 3 ? 3 : pairs <= 6 ? 4 : 5;
    return (
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={() => setScreen("menu")} style={s.backBtn}>← Menu</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>🎴 Level {level}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{pairs} pairs</div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, opacity: 0.9 }}>
            <div>⏱ {formatTime(soloTime)}</div>
            <div>🔄 {soloMoves} moves</div>
          </div>
        </div>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "12px 12px 40px" }}>
          {soloWon ? (
            <div style={s.winCard}>
              <div style={{ fontSize: 56 }}>🎉</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 8 }}>You did it!</div>
              <div style={{ fontSize: 15, opacity: 0.9, marginTop: 6 }}>
                {soloMoves} moves · {formatTime(soloTime)}
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
                <button style={s.winBtn} onClick={() => startSolo()}>🔄 Play Again</button>
                {level < LEVELS.length && (
                  <button style={{ ...s.winBtn, background: "rgba(255,255,255,0.2)", color: "white" }}
                    onClick={() => startSolo(level + 1)}>
                    ⬆️ Next Level
                  </button>
                )}
                <button style={{ ...s.winBtn, background: "rgba(255,255,255,0.15)", color: "white" }}
                  onClick={() => setScreen("menu")}>
                  🏠 Menu
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
              {soloDeck.map(card => {
                const isFlipped = soloFlipped.find(c => c.uid === card.uid);
                const isMatched = soloMatched.includes(card.pairId);
                return (
                  <div key={card.uid} onClick={() => !isMatched && !isFlipped && handleSoloFlip(card)}
                    style={{
                      aspectRatio: "3/4", borderRadius: 12,
                      cursor: isMatched ? "default" : "pointer",
                      transform: (isFlipped || isMatched) ? "scale(1.03)" : "scale(1)",
                      transition: "transform 0.2s",
                    }}>
                    {isFlipped || isMatched ? (
                      <div style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden",
                        border: isMatched ? "3px solid #1D9E75" : "3px solid #533AB7",
                        boxShadow: isMatched ? "0 4px 16px rgba(29,158,117,0.4)" : "0 4px 16px rgba(83,58,183,0.4)" }}>
                        <img src={card.img} alt={card.label}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                    ) : (
                      <CardBack fill rounded={12} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Multiplayer Lobby ─────────────────────────────────────
  if (screen === "lobby") {
    return (
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={() => setScreen("menu")} style={s.backBtn}>← Back</button>
          <div style={{ fontSize: 18, fontWeight: 700 }}>👥 Create Game</div>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
          <div style={s.card}>
            <div style={s.cardTitle}>🎯 Level: {LEVELS[level - 1].label}</div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
              {LEVELS[level - 1].desc} · Up to 4 players
            </div>
            {message && <div style={{ textAlign: "center", padding: "10px", borderRadius: 10, background: "#FFF3F3", color: "#C62828", fontSize: 13, marginBottom: 10 }}>{message}</div>}
            <GameLobby
              collectionName="matchingGames"
              emoji="🧩"
              maxPlayers={4}
              onCreate={createGame}
              onJoin={joinRoom}
              loading={loading}
              createLabel="🎮 Create Game Room"
            />
            <button style={{ ...s.btnGhost, marginTop: 10 }} onClick={() => setScreen("menu")}>
              ← Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting Room ──────────────────────────────────────────
  if (screen === "waiting" && game) {
    return (
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={leaveWaitingRoom} style={s.backBtn}>← Exit</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>🎴 Matching Game</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Waiting Room</div>
          </div>
          <div style={{ width: 60 }} />
        </div>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
          <div style={s.card}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Your room is showing in the lobby — other players can tap it to join!
              </div>
            </div>
            <div style={{ background: "linear-gradient(135deg, #533AB7, #1D9E75)",
              borderRadius: 12, padding: 16, color: "white", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>🎴 Quick Rules</div>
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>🔄 Take turns flipping <strong>2 cards</strong></div>
                <div>✅ <strong>Match a pair</strong> → keep your turn & score a point!</div>
                <div>❌ <strong>No match</strong> → cards flip back, next player's turn</div>
                <div>🏆 <strong>Most pairs</strong> at the end wins!</div>
                <div style={{ marginTop: 8, padding: "6px 10px",
                  background: "rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}>
                  💡 <em>Remember where the cards are — memory wins!</em>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Players ({game.players.length}/4):</div>
              {game.players.map((pid, i) => (
                <div key={pid} style={s.playerRow}>
                  <div style={{ ...s.avatar, background: COLORS[i] }}>
                    {(game.playerNames?.[pid] || "?")[0]}
                  </div>
                  <span>{game.playerNames?.[pid]}</span>
                  {pid === game.host && <span style={s.hostBadge}>Host</span>}
                  {pid === uid && <span style={s.youBadge}>You</span>}
                </div>
              ))}
            </div>
            {game.host === uid && game.players.length >= 2 && (
              <button style={s.btnGreen} onClick={startMultiplayer} disabled={loading}>
                {loading ? "Starting..." : "🎮 Start Game!"}
              </button>
            )}
            {game.host === uid && game.players.length < 2 && (
              <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Waiting for more players...
              </p>
            )}
            {game.host !== uid && (
              <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
                Waiting for host to start...
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Multiplayer Game ──────────────────────────────────────
  if (screen === "game" && game) {
    if (game.status === "finished") {
      const winnerName = game.playerNames?.[game.winner] || "Someone";
      return (
        <div style={s.container}>
          <div style={{ ...s.header, background: "linear-gradient(135deg, #F9A825, #F57F17)" }}>
            <button onClick={() => setScreen("menu")} style={s.backBtn}>← Menu</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 40 }}>🏆</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{winnerName} Wins!</div>
            </div>
            <div style={{ width: 60 }} />
          </div>
          <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 16px" }}>
            <div style={s.card}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>Final Scores:</div>
              {game.players.map((pid, i) => (
                <div key={pid} style={{ display: "flex", justifyContent: "space-between",
                  padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLORS[i] }} />
                    {game.playerNames?.[pid]} {pid === game.winner && "🏆"}
                  </span>
                  <span style={{ fontWeight: 700 }}>{game.scores?.[pid] || 0} pairs</span>
                </div>
              ))}
              {game.host === uid && (
                <button style={{ ...s.btnGreen, marginTop: 16 }}
                  onClick={async () => {
                    const deck = buildDeck(LEVELS[game.level - 1].pairs);
                    await updateDoc(doc(db, "matchingGames", roomId), {
                      status: "waiting", flipped: [], matched: [],
                      lastFlipped: [], winner: null, lastAction: null,
                      currentPlayerIndex: 0,
                      scores: Object.fromEntries(game.players.map(p => [p, 0])),
                      deck: deck.map(c => c.uid),
                      deckData: JSON.stringify(deck),
                    });
                  }}>
                  🔄 Play Again
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    const deck = JSON.parse(game.deckData);
    const isMyTurn = game.players[game.currentPlayerIndex] === uid;
    const currentPlayerName = game.playerNames?.[game.players[game.currentPlayerIndex]] || "?";
    const pairs = LEVELS[game.level - 1].pairs;
    const cols = pairs <= 3 ? 3 : pairs <= 6 ? 4 : 5;

    return (
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={() => setScreen("menu")} style={s.backBtn}>← Exit</button>
          <div style={{ fontSize: 15, fontWeight: 700 }}>🎴 Matching</div>
          <div style={{ fontSize: 12, opacity: 0.85, textAlign: "right" }}>
            {isMyTurn ? "🟢 Your turn!" : `⏳ ${currentPlayerName}`}
          </div>
        </div>
        <div style={{ maxWidth: 600, margin: "0 auto", padding: "8px 12px 40px" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {game.players.map((pid, i) => (
              <div key={pid} style={{
                ...s.playerChip,
                background: i === game.currentPlayerIndex ? COLORS[i] : "var(--bg-card)",
                color: i === game.currentPlayerIndex ? "white" : "var(--text)",
                border: `1.5px solid ${COLORS[i]}`,
              }}>
                <span style={{ fontWeight: 700 }}>{pid === uid ? "You" : game.playerNames?.[pid]}</span>
                <span style={{ fontSize: 12, marginLeft: 6 }}>{game.scores?.[pid] || 0} 🎴</span>
              </div>
            ))}
          </div>
          {game.lastAction && (
            <div style={{ textAlign: "center", fontSize: 13, color: "var(--text-secondary)",
              marginBottom: 10, fontStyle: "italic" }}>
              {game.lastAction}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8 }}>
            {deck.map(card => {
              const isFlipped = game.lastFlipped.includes(card.uid);
              const isMatched = game.matched.includes(card.uid);
              const canFlip = isMyTurn && !isFlipped && !isMatched && game.lastFlipped.length < 2;
              return (
                <div key={card.uid} onClick={() => canFlip && handleMultiFlip(card.uid)}
                  style={{
                    aspectRatio: "3/4", borderRadius: 12,
                    cursor: canFlip ? "pointer" : "default",
                    transform: (isFlipped || isMatched) ? "scale(1.03)" : "scale(1)",
                    transition: "transform 0.15s",
                  }}>
                  {isFlipped || isMatched ? (
                    <div style={{ width: "100%", height: "100%", borderRadius: 12, overflow: "hidden",
                      border: isMatched ? "3px solid #1D9E75" : "3px solid #533AB7",
                      boxShadow: isMatched ? "0 4px 16px rgba(29,158,117,0.4)" : "0 4px 16px rgba(83,58,183,0.3)" }}>
                      <img src={card.img} alt={card.label}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  ) : (
                    <div style={{ width: "100%", height: "100%",
                      opacity: canFlip ? 1 : 0.5,
                      filter: canFlip ? "none" : "grayscale(0.5)",
                      transition: "opacity 0.15s, filter 0.15s" }}>
                      <CardBack fill rounded={12} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return <div style={s.loading}>Loading...</div>;
}

const s = {
  container: { minHeight: "100vh", background: "var(--bg)", paddingBottom: 40 },
  header: {
    background: "linear-gradient(135deg, #533AB7, #D4537E)",
    padding: "14px 20px", color: "white", marginBottom: 16,
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  backBtn: {
    background: "rgba(255,255,255,0.2)", color: "white",
    border: "none", borderRadius: 8, padding: "6px 12px",
    cursor: "pointer", fontSize: 13, fontWeight: 600,
  },
  card: {
    background: "var(--bg-card)", borderRadius: 16, padding: "20px 24px",
    marginBottom: 16, boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  },
  cardTitle: { fontSize: 17, fontWeight: 700, marginBottom: 14, color: "var(--text)" },
  btnPrimary: {
    background: "#533AB7", color: "white", border: "none",
    borderRadius: 10, padding: "12px", fontWeight: 700,
    fontSize: 15, cursor: "pointer", width: "100%",
  },
  btnGreen: {
    background: "#1D9E75", color: "white", border: "none",
    borderRadius: 10, padding: "12px", fontWeight: 700,
    fontSize: 15, cursor: "pointer", width: "100%",
  },
  btnGhost: {
    background: "transparent", color: "var(--text)",
    border: "1px solid var(--border)", borderRadius: 10,
    padding: "10px", fontWeight: 600, fontSize: 14,
    cursor: "pointer", width: "100%", textAlign: "center",
  },
  input: {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--bg)",
    fontSize: 14, color: "var(--text)", boxSizing: "border-box",
  },
  message: {
    background: "#FFF3E0", color: "#E65100", borderRadius: 8,
    padding: "8px 14px", fontSize: 13, textAlign: "center",
    marginBottom: 16, fontWeight: 600,
  },
  winCard: {
    background: "linear-gradient(135deg, #533AB7, #D4537E)",
    borderRadius: 20, padding: "40px 24px", textAlign: "center",
    color: "white", boxShadow: "0 8px 32px rgba(83,58,183,0.3)",
  },
  winBtn: {
    background: "white", color: "#533AB7", border: "none",
    borderRadius: 10, padding: "12px 20px", fontWeight: 700,
    fontSize: 14, cursor: "pointer",
  },
  loading: { textAlign: "center", padding: 40, color: "var(--text-secondary)", fontSize: 15 },
  playerRow: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 0", borderBottom: "1px solid var(--border)",
  },
  avatar: {
    width: 32, height: 32, borderRadius: "50%", color: "white",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: 14,
  },
  hostBadge: {
    background: "#FDD835", color: "#333", borderRadius: 10,
    padding: "2px 8px", fontSize: 11, fontWeight: 700, marginLeft: "auto",
  },
  youBadge: {
    background: "#1D9E75", color: "white", borderRadius: 10,
    padding: "2px 8px", fontSize: 11, fontWeight: 700,
  },
  playerChip: {
    borderRadius: 20, padding: "6px 14px", fontSize: 13,
    display: "flex", alignItems: "center",
  },
};
