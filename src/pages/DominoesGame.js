import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import GameLobby from "../components/GameLobby";
import CardBack from "../components/CardBack";
import {
initGameState, parseTile,
  canPlayTile, getPlayableEnds, applyPlay,
  checkWinner, calculateScore, isBlocked
} from "../firebase/dominoesGame";

const COLORS = ["#533AB7", "#1D9E75", "#D4537E", "#BA7517"];
const PIP_POSITIONS = {
  0: [],
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 25], [75, 25], [25, 50], [75, 50], [25, 75], [75, 75]],
};

// ── Boneyard draw pile — a little stack of face-down Workshop cards ──
function BoneyardPile({ count, active, onDraw }) {
  if (count <= 0) return null;
  const cardW = 58;
  // Show up to 3 stacked cards for a "deck" look.
  const layers = Math.min(count, 3);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div
        onClick={active ? onDraw : undefined}
        style={{
          position: "relative",
          width: cardW + (layers - 1) * 4,
          height: Math.round(cardW * (640 / 411)) + (layers - 1) * 4,
          cursor: active ? "pointer" : "default",
          opacity: active ? 1 : 0.55,
          filter: active ? "none" : "grayscale(0.35)",
          transition: "opacity 0.15s, filter 0.15s, transform 0.15s",
          transform: active ? "translateY(-2px)" : "none",
        }}
      >
        {Array.from({ length: layers }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: i * 4,
              top: i * 4,
              filter: active && i === layers - 1
                ? "drop-shadow(0 4px 10px rgba(0,0,0,0.35))"
                : "none",
            }}
          >
            <CardBack width={cardW} />
          </div>
        ))}
        {/* Count badge */}
        <div style={{
          position: "absolute", right: -6, top: -6, zIndex: 5,
          background: active ? "#1D9E75" : "#7a7a8a", color: "white",
          borderRadius: 999, minWidth: 22, height: 22, padding: "0 6px",
          fontSize: 12, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}>
          {count}
        </div>
      </div>
      <div style={{
        fontSize: 11, fontWeight: 700,
        color: active ? "#1D9E75" : "var(--text-secondary)",
      }}>
        {active ? "Tap to draw" : "Boneyard"}
      </div>
    </div>
  );
}

function DominoTile({ tile, small = false, selected = false, playable = false, onClick }) {
  const size = small ? 28 : 36;
  const total = small ? 52 : 68;
  const pipR = small ? 2.5 : 3;

  return (
    <div onClick={onClick} style={{
      display: "inline-flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: selected ? "#FDD835" : playable ? "#E8F5E9" : "white",
      border: selected ? "2.5px solid #BA7517"
        : playable ? "2.5px solid #1D9E75"
        : "1.5px solid #ccc",
      borderRadius: 6, padding: 3, cursor: onClick ? "pointer" : "default",
      transform: selected ? "translateY(-6px)" : playable ? "translateY(-3px)" : "none",
      transition: "all 0.15s",
      boxShadow: selected ? "0 4px 12px rgba(186,117,23,0.4)"
        : playable ? "0 2px 8px rgba(29,158,117,0.3)"
        : "0 1px 3px rgba(0,0,0,0.1)",
      userSelect: "none", flexShrink: 0,
    }}>
      <DominoHalf value={tile.a} size={size} pipR={pipR} />
      <div style={{ width: total - 6, height: 1.5, background: "#999", margin: "1px 0" }} />
      <DominoHalf value={tile.b} size={size} pipR={pipR} />
    </div>
  );
}

function DominoHalf({ value, size, pipR }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {(PIP_POSITIONS[value] || []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={pipR * 3.5} fill="#333" />
      ))}
    </svg>
  );
}

function ChainTile({ tile }) {
  return (
    <div style={{
      display: "inline-flex", flexDirection: "row",
      alignItems: "center", justifyContent: "center",
      background: "white", border: "1.5px solid #aaa",
      borderRadius: 5, padding: "2px 1px", flexShrink: 0,
      boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
    }}>
      <ChainHalf value={tile.flipped ? tile.b : tile.a} />
      <div style={{ width: 1.5, height: 22, background: "#999", margin: "0 1px" }} />
      <ChainHalf value={tile.flipped ? tile.a : tile.b} />
    </div>
  );
}

function ChainHalf({ value }) {
  return (
    <svg width={22} height={22} viewBox="0 0 100 100">
      {(PIP_POSITIONS[value] || []).map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={12} fill="#333" />
      ))}
    </svg>
  );
}

export default function DominoesGame({ onExit }) {
  const { currentUser } = useAuth();
  const uid = currentUser.uid;
  const name = currentUser.displayName || "Player";

  const [game, setGame] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [screen, setScreen] = useState("lobby");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedTile, setSelectedTile] = useState(null);
  const [playableEnds, setPlayableEnds] = useState([]);

  useEffect(() => {
    if (!roomId) return;
    const gameRef = doc(db, "dominoesGames", roomId);
    const unsub = onSnapshot(gameRef, snap => {
      if (snap.exists()) {
        setGame(snap.data());
        setScreen("game");
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

  async function createGame() {
    setLoading(true);
    try {
      const id = "DOM-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      await setDoc(doc(db, "dominoesGames", id), {
        players: [uid],
        playerNames: { [uid]: name },
        status: "waiting",
        host: uid,
        createdAt: Date.now(),
        hands: {},
        boneyard: [],
        chain: [],
        leftEnd: null,
        rightEnd: null,
        currentPlayerIndex: 0,
        winner: null,
        lastAction: null,
        passCount: 0,
        scores: {},
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
      const snap = await getDoc(doc(db, "dominoesGames", id));
      if (!snap.exists()) {
        showMsg("❌ That room just closed. Pick another!");
        setLoading(false);
        return;
      }
      const data = snap.data();
      if (data.players.includes(uid)) { setRoomId(id); setLoading(false); return; }
      if (data.players.length >= 4) { showMsg("❌ That room is full!"); setLoading(false); return; }
      if (data.status !== "waiting") { showMsg("❌ That game already started!"); setLoading(false); return; }
      await updateDoc(doc(db, "dominoesGames", id), {
        players: [...data.players, uid],
        playerNames: { ...data.playerNames, [uid]: name },
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
      const gameRef = doc(db, "dominoesGames", id);
      if (game.host === uid) {
        await deleteDoc(gameRef);
      } else {
        const newPlayers = game.players.filter(p => p !== uid);
        const newNames = { ...game.playerNames };
        delete newNames[uid];
        await updateDoc(gameRef, { players: newPlayers, playerNames: newNames });
      }
    } catch (err) {
      console.error("Leave room cleanup failed:", err);
    }
  }

  async function startGame() {
    if (!game || game.players.length < 2) { showMsg("Need at least 2 players!"); return; }
    setLoading(true);
    const state = initGameState(game.players);
    await updateDoc(doc(db, "dominoesGames", roomId), {
      ...state,
      playerNames: game.playerNames,
      host: game.host,
      status: "playing",
    });
    setLoading(false);
  }

  async function resetGame() {
    await updateDoc(doc(db, "dominoesGames", roomId), {
      status: "waiting", hands: {}, boneyard: [],
      chain: [], leftEnd: null, rightEnd: null,
      winner: null, lastAction: null, passCount: 0, scores: {},
      currentPlayerIndex: 0,
    });
    setSelectedTile(null);
    setPlayableEnds([]);
  }

  function handleTileSelect(tileStr) {
    if (!game || game.status !== "playing") return;
    const isMyTurn = game.players[game.currentPlayerIndex] === uid;
    if (!isMyTurn) { showMsg("It's not your turn!"); return; }

    const tile = parseTile(tileStr);
    const ends = getPlayableEnds(tile, game.leftEnd, game.rightEnd);

    if (ends.length === 0) { showMsg("That tile can't be played!"); return; }

    if (selectedTile === tileStr) {
      setSelectedTile(null);
      setPlayableEnds([]);
      return;
    }

    setSelectedTile(tileStr);
    setPlayableEnds(ends);

    // If only one end available, auto-play
    if (ends.length === 1) {
      playTile(tileStr, ends[0]);
    }
  }

  async function playTile(tileStr, end) {
    if (!game) return;
    setLoading(true);
    const tile = parseTile(tileStr);
    const { newChain, newLeft, newRight } = applyPlay(
      game.chain, tile, end, game.leftEnd, game.rightEnd
    );

    const newHand = game.hands[uid].filter(t => t !== tileStr);
    const newHands = { ...game.hands, [uid]: newHand };
    const total = game.players.length;
    const nextIndex = (game.currentPlayerIndex + 1) % total;

    // Check winner
    if (checkWinner(newHands, uid)) {
      const scores = calculateScore(newHands, game.players);
      await updateDoc(doc(db, "dominoesGames", roomId), {
        hands: newHands, chain: newChain,
        leftEnd: newLeft, rightEnd: newRight,
        currentPlayerIndex: nextIndex,
        status: "finished", winner: uid,
        scores,
        lastAction: `${name} played their last tile and WINS! 🎉`,
        passCount: 0,
      });
      setLoading(false);
      setSelectedTile(null);
      setPlayableEnds([]);
      return;
    }

    // Check if game is blocked after this move
    const blocked = isBlocked(newHands, game.players, newLeft, newRight) &&
      newChain.length > 0 && game.boneyard.length === 0;

    if (blocked) {
      const scores = calculateScore(newHands, game.players);
      const lowestScore = Math.min(...Object.values(scores));
      const winnerId = game.players.find(p => scores[p] === lowestScore) || uid;
      await updateDoc(doc(db, "dominoesGames", roomId), {
        hands: newHands, chain: newChain,
        leftEnd: newLeft, rightEnd: newRight,
        status: "finished", winner: winnerId,
        scores,
        lastAction: `Game blocked! ${game.playerNames[winnerId]} wins with lowest score!`,
        passCount: 0,
      });
      setLoading(false);
      setSelectedTile(null);
      setPlayableEnds([]);
      return;
    }

    await updateDoc(doc(db, "dominoesGames", roomId), {
      hands: newHands, chain: newChain,
      leftEnd: newLeft, rightEnd: newRight,
      currentPlayerIndex: nextIndex,
      lastAction: `${name} played [${tile.a}|${tile.b}]`,
      passCount: 0,
    });

    setLoading(false);
    setSelectedTile(null);
    setPlayableEnds([]);
  }

  async function drawFromBoneyard() {
    if (!game || game.status !== "playing") return;
    const isMyTurn = game.players[game.currentPlayerIndex] === uid;
    if (!isMyTurn) { showMsg("It's not your turn!"); return; }
    if (game.boneyard.length === 0) { showMsg("Boneyard is empty!"); return; }

    setLoading(true);
    const newBoneyard = [...game.boneyard];
    const drawn = newBoneyard.shift();
    const drawnTile = parseTile(drawn);
    const newHand = [...game.hands[uid], drawn];
    const newHands = { ...game.hands, [uid]: newHand };

    // Check if drawn tile is playable
    const playable = canPlayTile(drawnTile, game.leftEnd, game.rightEnd);

    await updateDoc(doc(db, "dominoesGames", roomId), {
      hands: newHands,
      boneyard: newBoneyard,
      lastAction: `${name} drew from boneyard`,
    });

    if (!playable && newBoneyard.length === 0) {
      // Pass turn
      const total = game.players.length;
      const nextIndex = (game.currentPlayerIndex + 1) % total;
      const newPassCount = (game.passCount || 0) + 1;
      await updateDoc(doc(db, "dominoesGames", roomId), {
        currentPlayerIndex: nextIndex,
        passCount: newPassCount,
        lastAction: `${name} passed`,
      });
    }

    setLoading(false);
  }

  async function passTurn() {
    if (!game || game.status !== "playing") return;
    const isMyTurn = game.players[game.currentPlayerIndex] === uid;
    if (!isMyTurn) { showMsg("It's not your turn!"); return; }
    if (game.boneyard.length > 0) { showMsg("You must draw before passing!"); return; }

    setLoading(true);
    const total = game.players.length;
    const nextIndex = (game.currentPlayerIndex + 1) % total;
    const newPassCount = (game.passCount || 0) + 1;

    if (newPassCount >= total) {
      const scores = calculateScore(game.hands, game.players);
      const lowestScore = Math.min(...Object.values(scores));
      const winnerId = game.players.find(p => scores[p] === lowestScore) || uid;
      await updateDoc(doc(db, "dominoesGames", roomId), {
        status: "finished", winner: winnerId,
        scores,
        lastAction: `Game blocked! ${game.playerNames[winnerId]} wins!`,
        passCount: newPassCount,
      });
    } else {
      await updateDoc(doc(db, "dominoesGames", roomId), {
        currentPlayerIndex: nextIndex,
        passCount: newPassCount,
        lastAction: `${name} passed`,
      });
    }
    setLoading(false);
  }

  // ── Lobby ─────────────────────────────────────────────────
  if (screen === "lobby") {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={{ fontSize: 36 }}>🁢</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>Dominoes</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>2-4 Players</div>
        </div>
        <div style={styles.card}>
          {message && <div style={styles.message}>{message}</div>}
          <GameLobby
            collectionName="dominoesGames"
            emoji="🁢"
            maxPlayers={4}
            onCreate={createGame}
            onJoin={joinRoom}
            loading={loading}
            createLabel="🁢 Create New Game"
          />
          <button style={{ ...styles.btnGhost, marginTop: 10 }} onClick={onExit}>
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // ── Waiting Room ──────────────────────────────────────────
  if (game && game.status === "waiting") {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={{ fontSize: 36 }}>🁢</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>Dominoes — Waiting Room</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Your room is showing in the lobby — other players can tap it to join! (2-4 players)
          </div>
        </div>
        <div style={styles.card}>
          {message && <div style={styles.message}>{message}</div>}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>
              Players ({game.players.length}/4):
            </div>
            {game.players.map((pid, i) => (
              <div key={pid} style={styles.playerRow}>
                <div style={{ ...styles.avatar, background: COLORS[i] }}>
                  {(game.playerNames?.[pid] || "?")[0]}
                </div>
                <span>{game.playerNames?.[pid] || pid}</span>
                {pid === game.host && <span style={styles.hostBadge}>Host</span>}
                {pid === uid && <span style={styles.youBadge}>You</span>}
              </div>
            ))}
          </div>
          {game.host === uid && game.players.length >= 2 && (
            <button style={styles.btnGreen} onClick={startGame} disabled={loading}>
              {loading ? "Starting..." : "🎮 Start Game!"}
            </button>
          )}
          {game.host === uid && game.players.length < 2 && (
            <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Waiting for more players to join...
            </p>
          )}
          {game.host !== uid && (
            <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Waiting for host to start...
            </p>
          )}
          <div style={{ marginTop: 16, background: "linear-gradient(135deg, #2C3E50, #533AB7)",
            borderRadius: 12, padding: 16, color: "white" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>🁢 Quick Rules</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, opacity: 0.95 }}>
              <div>🎯 <strong>Goal:</strong> Empty your hand first to win!</div>
              <div>🟢 <strong>Green tiles</strong> can be played — tap to select</div>
              <div>🔗 <strong>Match numbers</strong> on either end of the chain</div>
              <div>🎲 <strong>Can't play?</strong> Draw from the Boneyard</div>
              <div>⏭ <strong>Boneyard empty?</strong> Pass your turn</div>
              <div>🏆 <strong>Blocked game?</strong> Lowest pip count wins!</div>
              <div style={{ marginTop: 8, padding: "8px 10px",
                background: "rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}>
                💡 <em>Tip: Save your doubles — they're harder to play!</em>
              </div>
            </div>
          </div>
          <button style={{ ...styles.btnGhost, marginTop: 10 }} onClick={leaveWaitingRoom}>
                      ← Leave Room
          </button>
        </div>
      </div>
    );
  }

  // ── Winner Screen ─────────────────────────────────────────
  if (game && game.status === "finished") {
    const winnerName = game.playerNames?.[game.winner] || "Someone";
    return (
      <div style={styles.container}>
        <div style={{ ...styles.header, background: "linear-gradient(135deg, #F9A825, #F57F17)" }}>
          <div style={{ fontSize: 56 }}>🏆</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{winnerName} Wins!</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>Dominoes Champion! 🁢</div>
        </div>
        <div style={styles.card}>
          {game.scores && Object.keys(game.scores).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Final Scores (lower is better):</div>
              {game.players.map((pid, i) => (
                <div key={pid} style={{ display: "flex", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: COLORS[i] }} />
                    {game.playerNames?.[pid]}
                    {pid === game.winner && " 🏆"}
                  </span>
                  <span style={{ fontWeight: 700 }}>{game.scores[pid]} pts</span>
                </div>
              ))}
            </div>
          )}
          {game.host === uid && (
            <button style={styles.btnGreen} onClick={resetGame}>🔄 Play Again</button>
          )}
          <button style={{ ...styles.btnGhost, marginTop: 10 }} onClick={onExit}>
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // ── Active Game ───────────────────────────────────────────
  if (!game || !game.hands) return <div style={styles.loading}>Loading game...</div>;

  const myHand = game.hands[uid] || [];
  const isMyTurn = game.players[game.currentPlayerIndex] === uid;
  const currentPlayerName = game.playerNames?.[game.players[game.currentPlayerIndex]] || "?";
  const myPlayerIndex = game.players.indexOf(uid);

  const hasPlayableTile = myHand.some(t => {
    const tile = parseTile(t);
    return canPlayTile(tile, game.leftEnd, game.rightEnd);
  });

  // The boneyard pile is tappable only when you're allowed to draw:
  // your turn, you have no playable tile, tiles remain, and nothing's loading.
  const canDrawNow = isMyTurn && !hasPlayableTile && game.boneyard.length > 0 && !loading;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <button onClick={onExit} style={styles.backBtn}>← Exit</button>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🁢 Dominoes</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Boneyard: {game.boneyard.length}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 12px 24px" }}>

        {/* Status bar */}
        <div style={styles.statusBar}>
          <div style={{ fontWeight: 700, color: isMyTurn ? "#1D9E75" : "var(--text-secondary)" }}>
            {isMyTurn ? "🟢 Your Turn!" : `⏳ ${currentPlayerName}'s turn`}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            [{game.leftEnd ?? "?"} ← chain → {game.rightEnd ?? "?"}]
          </div>
        </div>

        {game.lastAction && (
          <div style={styles.lastAction}>{game.lastAction}</div>
        )}

        {message && <div style={styles.message}>{message}</div>}

        {/* Other players hand counts */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {game.players.map((pid, i) => {
            const isActive = i === game.currentPlayerIndex;
            const handCount = game.hands?.[pid]?.length || 0;
            const pName = game.playerNames?.[pid] || "?";
            return (
              <div key={pid} style={{
                ...styles.playerChip,
                background: isActive ? COLORS[i] : "var(--bg-card)",
                color: isActive ? "white" : "var(--text)",
                border: `1.5px solid ${COLORS[i]}`,
              }}>
                <span style={{ fontWeight: 700 }}>{pid === uid ? "You" : pName}</span>
                <span style={{ fontSize: 12, marginLeft: 6 }}>
                  {handCount} tile{handCount !== 1 ? "s" : ""}
                </span>
              </div>
            );
          })}
        </div>

        {/* Table: chain + boneyard draw pile side by side */}
        <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginBottom: 8 }}>
          <div style={{ ...styles.chainContainer, flex: 1, marginBottom: 0 }}>
            {game.chain.length === 0 ? (
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
                Play the first tile to start the chain!
              </div>
            ) : (
              <div style={styles.chainScroll}>
                {game.chain.map((tile, i) => (
                  <ChainTile key={i} tile={tile} />
                ))}
              </div>
            )}
          </div>

          {game.boneyard.length > 0 && (
            <div style={styles.boneyardZone}>
              <BoneyardPile
                count={game.boneyard.length}
                active={canDrawNow}
                onDraw={drawFromBoneyard}
              />
            </div>
          )}
        </div>

        {/* End indicators */}
        {game.chain.length > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between",
            fontSize: 13, color: "var(--text-secondary)", marginBottom: 12, padding: "0 4px" }}>
            <span>← Left end: <strong>{game.leftEnd}</strong></span>
            <span>Right end: <strong>{game.rightEnd}</strong> →</span>
          </div>
        )}

        {/* Action buttons */}
        {isMyTurn && (
          <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
            {game.boneyard.length > 0 && !hasPlayableTile && (
              <button style={{ ...styles.btnPrimary, flex: 1 }}
                onClick={drawFromBoneyard} disabled={loading}>
                🎲 Draw from Boneyard ({game.boneyard.length})
              </button>
            )}
            {game.boneyard.length === 0 && !hasPlayableTile && (
              <button style={{ ...styles.btnGhost, flex: 1 }}
                onClick={passTurn} disabled={loading}>
                ⏭ Pass Turn
              </button>
            )}
            {selectedTile && playableEnds.length > 1 && (
              <>
                <button style={{ ...styles.btnGreen, flex: 1 }}
                  onClick={() => playTile(selectedTile, "left")} disabled={loading}>
                  ← Play Left ({game.leftEnd})
                </button>
                <button style={{ ...styles.btnPrimary, flex: 1 }}
                  onClick={() => playTile(selectedTile, "right")} disabled={loading}>
                  Play Right ({game.rightEnd}) →
                </button>
              </>
            )}
          </div>
        )}

        {/* My hand */}
        <div style={styles.handContainer}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Your Tiles ({myHand.length})</span>
            <div style={{ width: 12, height: 12, borderRadius: "50%",
              background: COLORS[myPlayerIndex] }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
            {myHand.map(tileStr => {
              const tile = parseTile(tileStr);
              const ends = isMyTurn
                ? getPlayableEnds(tile, game.leftEnd, game.rightEnd)
                : [];
              const playable = ends.length > 0;
              return (
                <DominoTile
                  key={tileStr}
                  tile={tile}
                  selected={selectedTile === tileStr}
                  playable={isMyTurn && playable}
                  onClick={isMyTurn ? () => handleTileSelect(tileStr) : undefined}
                />
              );
            })}
          </div>
          {isMyTurn && !hasPlayableTile && game.boneyard.length === 0 && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 13,
              color: "var(--text-secondary)", fontStyle: "italic" }}>
              No playable tiles — you must pass.
            </div>
          )}
          {isMyTurn && !hasPlayableTile && game.boneyard.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 13,
              color: "#1D9E75", fontWeight: 600 }}>
              No playable tiles — tap the boneyard to draw!
            </div>
          )}
          {isMyTurn && hasPlayableTile && !selectedTile && (
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 13,
              color: "#1D9E75", fontWeight: 600 }}>
              Tap a highlighted tile to play it!
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", paddingBottom: 40 },
  header: {
    background: "linear-gradient(135deg, #2C3E50, #533AB7)",
    padding: "16px 20px", color: "white", marginBottom: 16,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexDirection: "column",
  },
  card: {
    background: "var(--bg-card)", borderRadius: 16,
    padding: "24px", maxWidth: 480, margin: "0 auto",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    display: "flex", flexDirection: "column",
  },
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
  backBtn: {
    background: "rgba(255,255,255,0.2)", color: "white",
    border: "none", borderRadius: 8, padding: "6px 12px",
    cursor: "pointer", fontSize: 13, fontWeight: 600,
  },
  statusBar: {
    background: "var(--bg-card)", borderRadius: 10,
    padding: "10px 16px", marginBottom: 10,
    display: "flex", justifyContent: "space-between",
    alignItems: "center", fontSize: 14,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  lastAction: {
    textAlign: "center", fontSize: 13,
    color: "var(--text-secondary)", marginBottom: 10,
    fontStyle: "italic",
  },
  message: {
    background: "#FFF3E0", color: "#E65100",
    borderRadius: 8, padding: "8px 14px",
    fontSize: 13, textAlign: "center", marginBottom: 10,
    fontWeight: 600,
  },
  loading: {
    textAlign: "center", padding: 40,
    color: "var(--text-secondary)", fontSize: 15,
  },
  chainContainer: {
    background: "#2C3E50", borderRadius: 12,
    padding: "14px 10px", marginBottom: 8,
    minHeight: 80, display: "flex",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  chainScroll: {
    display: "flex", gap: 4, overflowX: "auto",
    alignItems: "center", padding: "4px 2px",
    width: "100%",
  },
  boneyardZone: {
    background: "#2C3E50", borderRadius: 12,
    padding: "10px 12px", minHeight: 80,
    display: "flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  handContainer: {
    background: "var(--bg-card)", borderRadius: 16,
    padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  playerChip: {
    borderRadius: 20, padding: "6px 14px",
    fontSize: 13, display: "flex", alignItems: "center",
  },
  playerRow: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 0", borderBottom: "1px solid var(--border)",
  },
  avatar: {
    width: 32, height: 32, borderRadius: "50%",
    color: "white", display: "flex", alignItems: "center",
    justifyContent: "center", fontWeight: 700, fontSize: 14,
  },
  hostBadge: {
    background: "#FDD835", color: "#333",
    borderRadius: 10, padding: "2px 8px",
    fontSize: 11, fontWeight: 700, marginLeft: "auto",
  },
  youBadge: {
    background: "#1D9E75", color: "white",
    borderRadius: 10, padding: "2px 8px",
    fontSize: 11, fontWeight: 700,
  },
  input: {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--bg)",
    fontSize: 14, color: "var(--text)", boxSizing: "border-box",
  },
};