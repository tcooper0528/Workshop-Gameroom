import { useState, useEffect } from "react";
// One Switcheroo — Workshop Gameroom's color-matching card game
import { doc, onSnapshot, updateDoc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import GameLobby from "../components/GameLobby";
import CardBack from "../components/CardBack";
import {
  initGameState, canPlay, cardLabel, nextPlayerIndex,
  COLOR_HEX, COLORS
} from "../firebase/switcherooGame";

export default function SwitcherooGame({ onExit }) {
  const { currentUser } = useAuth();
  const uid = currentUser.uid;
  const name = currentUser.displayName || "Player";

  const [game, setGame] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [screen, setScreen] = useState("lobby"); // lobby | game

  // Listen to game state
  useEffect(() => {
    if (!roomId) return;
    const gameRef = doc(db, "switcherooGames", roomId);
    const unsub = onSnapshot(gameRef, snap => {
      if (snap.exists()) {
        setGame(snap.data());
        setScreen("game");
      } else {
        // Room was closed by the host
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

  // Create a new room
  async function createGame() {
    setLoading(true);
    try {
      const id = "SWITCH-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const gameRef = doc(db, "switcherooGames", id);
      await setDoc(gameRef, {
        players: [uid],
        playerNames: { [uid]: name },
        status: "waiting",
        host: uid,
        createdAt: Date.now(),
        hands: {},
        drawPile: [],
        discardPile: [],
        currentPlayerIndex: 0,
        direction: 1,
        currentColor: "red",
        winner: null,
        lastAction: null,
        pendingDraw: 0,
        switchCallers: [],
      });
      setRoomId(id);
    } catch (err) {
      console.error("Create room failed:", err);
      showMsg("❌ Couldn't create the room. Check your internet and try again!");
    }
    setLoading(false);
  }

  // Join a room from the tap-to-join list
  async function joinRoom(id) {
    setLoading(true);
    try {
      const gameRef = doc(db, "switcherooGames", id);
      const snap = await getDoc(gameRef);
      if (!snap.exists()) {
        showMsg("❌ That room just closed. Pick another!");
        setLoading(false);
        return;
      }
      const data = snap.data();
      if (data.players.includes(uid)) {
        setRoomId(id);
        setLoading(false);
        return;
      }
      if (data.players.length >= 6) {
        showMsg("❌ That room is full!");
        setLoading(false);
        return;
      }
      if (data.status !== "waiting") {
        showMsg("❌ That game already started!");
        setLoading(false);
        return;
      }
      await updateDoc(gameRef, {
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

  // Leave the waiting room (host closes it, guests step out)
  async function leaveWaitingRoom() {
    const id = roomId;
    setRoomId(null);
    setGame(null);
    setScreen("lobby");
    try {
      if (!id || !game) return;
      const gameRef = doc(db, "switcherooGames", id);
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

  // Host starts the game
  async function startGame() {
    if (!game || game.players.length < 2) {
      showMsg("Need at least 2 players to start!");
      return;
    }
    setLoading(true);
    const gameRef = doc(db, "switcherooGames", roomId);
    const state = initGameState(game.players);
    await updateDoc(gameRef, { ...state, status: "playing" });
    setLoading(false);
  }

  // Play a card
  async function playCard(card, chosenColor = null) {
    if (!game || game.status !== "playing") return;
    const gameRef = doc(db, "switcherooGames", roomId);
    const myIndex = game.players.indexOf(uid);
    if (myIndex !== game.currentPlayerIndex) { showMsg("It's not your turn!"); return; }

    const topCard = game.discardPile[game.discardPile.length - 1];
    if (!canPlay(card, topCard, game.currentColor)) {
      showMsg("You can't play that card!");
      return;
    }

    if ((card.value === "wild" || card.value === "wild4") && !chosenColor) {
      setSelectedCard(card);
      setShowColorPicker(true);
      return;
    }

    setLoading(true);
    const newHand = game.hands[uid].filter(c => c.id !== card.id);
    const newHands = { ...game.hands, [uid]: newHand };
    const newDiscard = [...game.discardPile, card];
    let newColor = chosenColor || card.color;
    let newDirection = game.direction;
    let pendingDraw = 0;
    let skip = false;
    const total = game.players.length;

    if (card.value === "reverse") {
      newDirection = game.direction * -1;
      if (total === 2) skip = true;
    }
    if (card.value === "skip") skip = true;
    if (card.value === "draw2") pendingDraw = (game.pendingDraw || 0) + 2;
    if (card.value === "wild4") pendingDraw = (game.pendingDraw || 0) + 4;

    const nextIndex = nextPlayerIndex(game.currentPlayerIndex, total, newDirection, skip);

    if (newHand.length === 0) {
      await updateDoc(gameRef, {
        hands: newHands, discardPile: newDiscard,
        currentColor: newColor, direction: newDirection,
        currentPlayerIndex: nextIndex, pendingDraw,
        status: "finished", winner: uid,
        lastAction: `${name} played ${cardLabel(card)} and WINS! 🎉`,
      });
      setLoading(false);
      return;
    }

    await updateDoc(gameRef, {
      hands: newHands, discardPile: newDiscard,
      currentColor: newColor, direction: newDirection,
      currentPlayerIndex: nextIndex, pendingDraw,
      lastAction: `${name} played ${cardLabel(card)}`,
    });

    setSelectedCard(null);
    setShowColorPicker(false);
    setLoading(false);
  }

  // Draw a card
  async function drawCard() {
    if (!game || game.status !== "playing") return;
    const gameRef = doc(db, "switcherooGames", roomId);
    const myIndex = game.players.indexOf(uid);
    if (myIndex !== game.currentPlayerIndex) { showMsg("It's not your turn!"); return; }

    setLoading(true);
    let pile = [...game.drawPile];
    const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;

    if (pile.length < drawCount) {
      const discard = [...game.discardPile];
      const top = discard.pop();
      pile = [...pile, ...discard.sort(() => Math.random() - 0.5)];
      await updateDoc(gameRef, { drawPile: pile, discardPile: [top] });
    }

    const drawn = pile.splice(0, drawCount);
    const newHand = [...game.hands[uid], ...drawn];
    const total = game.players.length;
    const nextIndex = game.pendingDraw > 0
      ? nextPlayerIndex(game.currentPlayerIndex, total, game.direction)
      : game.currentPlayerIndex;

    await updateDoc(gameRef, {
      drawPile: pile,
      hands: { ...game.hands, [uid]: newHand },
      pendingDraw: 0,
      currentPlayerIndex: nextIndex,
      lastAction: `${name} drew ${drawCount} card${drawCount > 1 ? "s" : ""}`,
    });
    setLoading(false);
  }

  // Call "Switcheroo!" (down to your last card)
  async function callSwitcheroo() {
    if (!game) return;
    const gameRef = doc(db, "switcherooGames", roomId);
    const myHand = game.hands[uid] || [];
    if (myHand.length !== 1) { showMsg("You can only call Switcheroo with 1 card left!"); return; }
    await updateDoc(gameRef, {
      switchCallers: [...(game.switchCallers || []), uid],
      lastAction: `${name} shouted SWITCHEROO! 🔀`,
    });
    showMsg("SWITCHEROO! 🔀");
  }

  // Reset game
  async function resetGame() {
    const gameRef = doc(db, "switcherooGames", roomId);
    await updateDoc(gameRef, {
      status: "waiting", hands: {}, drawPile: [],
      discardPile: [], winner: null, lastAction: null,
      pendingDraw: 0, switchCallers: [],
    });
  }

  // ── Lobby Screen ──────────────────────────────────────────
  if (screen === "lobby") {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={{ fontSize: 36 }}>🎴</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>One Switcheroo</div>
        </div>
        <div style={styles.card}>
          {message && <div style={styles.message}>{message}</div>}
          <GameLobby
            collectionName="switcherooGames"
            emoji="🔀"
            maxPlayers={6}
            onCreate={createGame}
            onJoin={joinRoom}
            loading={loading}
            createLabel="🔀 Create New Game"
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
          <div style={{ fontSize: 36 }}>🎴</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>One Switcheroo — Waiting Room</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Your room is showing in the lobby — other players can tap it to join!
          </div>
        </div>
        <div style={styles.card}>
          {message && <div style={styles.message}>{message}</div>}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>
              Players Joined ({game.players.length}/6):
            </div>
            {game.players.map(pid => (
              <div key={pid} style={styles.playerRow}>
                <div style={styles.avatar}>{(game.playerNames?.[pid] || "?")[0]}</div>
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
              Waiting for host to start the game...
            </p>
          )}
          <button style={{ ...styles.btnGhost, marginTop: 10 }} onClick={leaveWaitingRoom}>
            ← Leave Room
          </button>
        </div>
      </div>
    );
  }

  // ── Winner Screen ──────────────────────────────────────────
  if (game && game.status === "finished") {
    const winnerName = game.playerNames?.[game.winner] || "Someone";
    return (
      <div style={styles.container}>
        <div style={{ ...styles.header, background: "linear-gradient(135deg, #F9A825, #F57F17)" }}>
          <div style={{ fontSize: 56 }}>🏆</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{winnerName} Wins!</div>
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>Switcheroo Champion! 🔀</div>
        </div>
        <div style={styles.card}>
          {game.host === uid && (
            <button style={styles.btnGreen} onClick={resetGame}>
              🔄 Play Again
            </button>
          )}
          <button style={{ ...styles.btnGhost, marginTop: 10 }} onClick={onExit}>
            ← Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  // ── Active Game ──────────────────────────────────────────
  if (!game || !game.hands) return <div style={styles.loading}>Loading game...</div>;

  const myHand = game.hands?.[uid] || [];
  const topCard = game.discardPile?.[game.discardPile.length - 1];
  const isMyTurn = game.players[game.currentPlayerIndex] === uid;
  const currentPlayerName = game.playerNames?.[game.players[game.currentPlayerIndex]] || "?";

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <button onClick={onExit} style={styles.backBtn}>← Exit</button>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🔀 One Switcheroo</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {game.direction === 1 ? "↻ CW" : "↺ CCW"}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "0 12px 24px" }}>
        <div style={styles.statusBar}>
          {isMyTurn
            ? <span style={{ color: "#1D9E75", fontWeight: 700 }}>🟢 Your turn!</span>
            : <span>⏳ {currentPlayerName}'s turn</span>}
          {game.pendingDraw > 0 && (
            <span style={{ color: "#E53935", fontWeight: 700 }}>
              ⚠️ Draw {game.pendingDraw} or stack!
            </span>
          )}
        </div>

        {game.lastAction && (
          <div style={styles.lastAction}>{game.lastAction}</div>
        )}

        {message && <div style={styles.message}>{message}</div>}

        <div style={styles.playersRow}>
          {game.players.map((pid, i) => {
            const isActive = i === game.currentPlayerIndex;
            const handCount = game.hands?.[pid]?.length || 0;
            const pName = game.playerNames?.[pid] || "?";
            return (
              <div key={pid} style={{
                ...styles.playerChip,
                background: isActive ? "#533AB7" : "var(--bg-card)",
                color: isActive ? "white" : "var(--text)"
              }}>
                <span style={{ fontWeight: 700 }}>{pid === uid ? "You" : pName}</span>
                <span style={{ fontSize: 12, marginLeft: 6 }}>
                  {handCount} card{handCount !== 1 ? "s" : ""}
                  {handCount === 1 && " 🔀"}
                </span>
              </div>
            );
          })}
        </div>

        <div style={styles.playArea}>
          {/* Draw pile — the Workshop card back (tap to draw on your turn) */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
            opacity: isMyTurn ? 1 : 0.6,
          }}>
            <CardBack width={64} onClick={isMyTurn ? drawCard : undefined} />
            <div style={{ fontSize: 11, color: "white", fontWeight: 600 }}>
              Draw · {game.drawPile?.length || 0}
            </div>
          </div>

          {topCard && (
            <div style={{
              ...styles.gameCard,
              background: COLOR_HEX[game.currentColor] || COLOR_HEX[topCard.color],
              transform: "scale(1.1)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)"
            }}>
              <div style={styles.cardCorner}>{cardLabel(topCard)}</div>
              <div style={styles.cardCenter}>{cardLabel(topCard)}</div>
              <div style={{ ...styles.cardCorner, transform: "rotate(180deg)" }}>{cardLabel(topCard)}</div>
            </div>
          )}

          {/* Active color — the card back with the current color circle on top */}
          <div style={{ textAlign: "center" }}>
            <CardBack width={64} color={COLOR_HEX[game.currentColor]} />
            <div style={{ fontSize: 11, color: "white", marginTop: 4 }}>Color</div>
          </div>
        </div>

        {myHand.length === 1 && (
          <button onClick={callSwitcheroo}
            style={{ ...styles.btnShout, display: "block", margin: "0 auto 12px" }}>
            🔀 Shout Switcheroo!
          </button>
        )}

        <div style={styles.handContainer}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
            Your Hand ({myHand.length} cards)
          </div>
          <div style={styles.handCards}>
            {myHand.map(card => {
              const playable = isMyTurn && canPlay(card, topCard, game.currentColor);
              return (
                <div key={card.id}
                  onClick={() => playable && playCard(card)}
                  style={{
                    ...styles.gameCard,
                    background: COLOR_HEX[card.color],
                    cursor: playable ? "pointer" : "not-allowed",
                    opacity: isMyTurn ? (playable ? 1 : 0.45) : 0.7,
                    transform: playable ? "translateY(-8px)" : "none",
                    boxShadow: playable ? "0 6px 16px rgba(0,0,0,0.3)" : "0 2px 6px rgba(0,0,0,0.15)",
                    transition: "all 0.15s",
                  }}>
                  <div style={styles.cardCorner}>{cardLabel(card)}</div>
                  <div style={styles.cardCenter}>{cardLabel(card)}</div>
                  <div style={{ ...styles.cardCorner, transform: "rotate(180deg)" }}>{cardLabel(card)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {showColorPicker && (
          <div style={styles.overlay}>
            <div style={styles.colorPicker}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Choose a Color</div>
              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                {COLORS.map(color => (
                  <div key={color}
                    onClick={() => { setShowColorPicker(false); playCard(selectedCard, color); }}
                    style={{
                      width: 56, height: 56, borderRadius: "50%",
                      background: COLOR_HEX[color], cursor: "pointer",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    }}
                  />
                ))}
              </div>
              <button style={{ ...styles.btnGhost, marginTop: 16 }}
                onClick={() => setShowColorPicker(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", paddingBottom: 40 },
  header: {
    background: "linear-gradient(135deg, #E53935, #B71C1C)",
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
  btnShout: {
    background: "#FDD835", color: "#333", border: "none",
    borderRadius: 10, padding: "10px 24px", fontWeight: 800,
    fontSize: 16, cursor: "pointer",
    boxShadow: "0 4px 12px rgba(253,216,53,0.5)",
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
  playersRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  playerChip: {
    borderRadius: 20, padding: "6px 14px",
    fontSize: 13, border: "1px solid var(--border)",
    display: "flex", alignItems: "center",
  },
  playArea: {
    display: "flex", gap: 20, alignItems: "center",
    justifyContent: "center", padding: "20px 0",
    background: "#2d7a4f", borderRadius: 16, marginBottom: 16,
  },
  gameCard: {
    width: 64, height: 96, borderRadius: 10,
    display: "flex", flexDirection: "column",
    justifyContent: "space-between", padding: "4px 6px",
    color: "white", fontWeight: 800,
    border: "3px solid rgba(255,255,255,0.8)",
    position: "relative", userSelect: "none", flexShrink: 0,
  },
  cardCorner: { fontSize: 14, lineHeight: 1 },
  cardCenter: {
    fontSize: 22, textAlign: "center",
    position: "absolute", top: "50%", left: "50%",
    transform: "translate(-50%,-50%)",
  },
  cardBack: {
    width: 64, height: 96, borderRadius: 10,
    background: "linear-gradient(135deg, #1a1a2e, #533AB7)",
    border: "3px solid rgba(255,255,255,0.5)",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    color: "white", fontWeight: 700, fontSize: 13,
  },
  handContainer: {
    background: "var(--bg-card)", borderRadius: 16, padding: "16px",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  handCards: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  playerRow: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 0", borderBottom: "1px solid var(--border)",
  },
  avatar: {
    width: 32, height: 32, borderRadius: "50%",
    background: "#533AB7", color: "white",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 700, fontSize: 14,
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
  overlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.6)", display: "flex",
    alignItems: "center", justifyContent: "center", zIndex: 1000,
  },
  colorPicker: {
    background: "white", borderRadius: 20, padding: "28px",
    textAlign: "center", boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
  },
  input: {
    width: "100%", padding: "10px 14px", borderRadius: 10,
    border: "1px solid var(--border)", background: "var(--bg)",
    fontSize: 14, color: "var(--text)", boxSizing: "border-box",
  },
};