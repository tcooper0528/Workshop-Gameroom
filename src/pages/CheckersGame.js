import { useState, useEffect } from "react";
import { doc, onSnapshot, updateDoc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import GameLobby from "../components/GameLobby";
import {
  initGameState, getAllValidMoves, applyMove,
  checkWinner, pieceOwner, isKing, P1, P2,
  flattenBoard, unflattenBoard
} from "../firebase/checkersGame";

export default function CheckersGame({ onExit }) {
  const { currentUser } = useAuth();
  const uid = currentUser.uid;
  const name = currentUser.displayName || "Player";

  const [game, setGame] = useState(null);
  const [roomId, setRoomId] = useState(null);
  const [screen, setScreen] = useState("lobby");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [validMoves, setValidMoves] = useState([]);

  useEffect(() => {
    if (!roomId) return;
    const gameRef = doc(db, "checkersGames", roomId);
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
      const id = "CHK-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      await setDoc(doc(db, "checkersGames", id), {
        players: [uid],
        playerNames: { [uid]: name },
        status: "waiting",
        host: uid,
        createdAt: Date.now(),
        board: [],
        currentPlayerIndex: 0,
        winner: null,
        lastAction: null,
        mustJumpFrom: null,
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
      const snap = await getDoc(doc(db, "checkersGames", id));
      if (!snap.exists()) {
        showMsg("❌ That room just closed. Pick another!");
        setLoading(false);
        return;
      }
      const data = snap.data();
      if (data.players.includes(uid)) { setRoomId(id); setLoading(false); return; }
      if (data.players.length >= 2) { showMsg("❌ That room is full!"); setLoading(false); return; }
      if (data.status !== "waiting") { showMsg("❌ That game already started!"); setLoading(false); return; }
      await updateDoc(doc(db, "checkersGames", id), {
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
      const gameRef = doc(db, "checkersGames", id);
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
    if (!game || game.players.length < 2) { showMsg("Need 2 players!"); return; }
    setLoading(true);
    const state = initGameState(game.players);
    await updateDoc(doc(db, "checkersGames", roomId), {
      ...state,
      playerNames: game.playerNames,
      host: game.host,
      status: "playing",
    });
    setLoading(false);
  }

  async function resetGame() {
    await updateDoc(doc(db, "checkersGames", roomId), {
      status: "waiting", board: [], winner: null,
      lastAction: null, mustJumpFrom: null,
      currentPlayerIndex: 0,
    });
    setSelected(null);
    setValidMoves([]);
  }

  function handleCellClick(row, col) {
    if (!game || game.status !== "playing") return;
    const myPlayerIndex = game.players.indexOf(uid);
    const myPiece = myPlayerIndex === 0 ? P1 : P2;
    const currentPiece = game.currentPlayerIndex === 0 ? P1 : P2;

    if (myPiece !== currentPiece) { showMsg("It's not your turn!"); return; }

    const board = unflattenBoard(game.board);
    const piece = board[row][col];

    if (piece && pieceOwner(piece) === myPiece) {
      const allMoves = getAllValidMoves(board, myPiece, game.mustJumpFrom);
      const pieceMoves = allMoves.filter(m => m.from[0] === row && m.from[1] === col);
      const hasJumps = allMoves.some(m => m.jump);
      if (hasJumps && !pieceMoves.some(m => m.jump)) {
        showMsg("You must jump with another piece!");
        return;
      }
      setSelected([row, col]);
      setValidMoves(pieceMoves);
      return;
    }

    if (selected) {
      const move = validMoves.find(m => m.to[0] === row && m.to[1] === col);
      if (move) {
        executeMove(move, myPiece);
        return;
      }
    }

    setSelected(null);
    setValidMoves([]);
  }

  async function executeMove(move, myPiece) {
    const board2D = unflattenBoard(game.board);
    const newBoard = applyMove(board2D, move);
    const nextPlayerIndex = game.currentPlayerIndex === 0 ? 1 : 0;
    const nextPiece = nextPlayerIndex === 0 ? P1 : P2;

    let mustJumpFrom = null;
    if (move.jump) {
      const [tr, tc] = move.to;
      const furtherJumps = getAllValidMoves(newBoard, myPiece, [tr, tc])
        .filter(m => m.jump);
      if (furtherJumps.length > 0) mustJumpFrom = [tr, tc];
    }

    const opponentLoses = checkWinner(
      newBoard,
      mustJumpFrom ? myPiece : nextPiece
    );

    const actionName = move.jump ? `${name} jumped!` : `${name} moved`;

    if (opponentLoses && !mustJumpFrom) {
      await updateDoc(doc(db, "checkersGames", roomId), {
        board: flattenBoard(newBoard),
        currentPlayerIndex: nextPlayerIndex,
        status: "finished",
        winner: uid,
        lastAction: `${name} wins! 🏆`,
        mustJumpFrom: null,
      });
    } else {
      await updateDoc(doc(db, "checkersGames", roomId), {
        board: flattenBoard(newBoard),
        currentPlayerIndex: mustJumpFrom ? game.currentPlayerIndex : nextPlayerIndex,
        lastAction: actionName,
        mustJumpFrom: mustJumpFrom || null,
        status: "playing",
      });
    }

    setSelected(null);
    setValidMoves([]);
  }

  // ── Lobby ─────────────────────────────────────────────────
  if (screen === "lobby") {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={{ fontSize: 36 }}>🔴</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>Checkers</div>
          <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>2 Players</div>
        </div>
        <div style={styles.card}>
          {message && <div style={styles.message}>{message}</div>}
          <GameLobby
            collectionName="checkersGames"
            emoji="🔴"
            maxPlayers={2}
            onCreate={createGame}
            onJoin={joinRoom}
            loading={loading}
            createLabel="🔴 Create New Game"
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
          <div style={{ fontSize: 36 }}>🔴</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>Checkers — Waiting Room</div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
            Your room is showing in the lobby — other players can tap it to join!
          </div>
        </div>
        <div style={styles.card}>
          {message && <div style={styles.message}>{message}</div>}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>Players ({game.players.length}/2):</div>
            {game.players.map((pid, i) => (
              <div key={pid} style={styles.playerRow}>
                <div style={{ ...styles.avatar, background: i === 0 ? "#533AB7" : "#1D9E75" }}>
                  {(game.playerNames?.[pid] || "?")[0]}
                </div>
                <span>{game.playerNames?.[pid] || pid}</span>
                <span style={{ ...styles.pieceBadge, background: i === 0 ? "#533AB7" : "#1D9E75" }}>
                  {i === 0 ? "🟣 Purple" : "🟢 Green"}
                </span>
                {pid === game.host && <span style={styles.hostBadge}>Host</span>}
                {pid === uid && <span style={styles.youBadge}>You</span>}
              </div>
            ))}
          </div>
          {game.host === uid && game.players.length === 2 && (
            <button style={styles.btnGreen} onClick={startGame} disabled={loading}>
              {loading ? "Starting..." : "🎮 Start Game!"}
            </button>
          )}
          {game.host === uid && game.players.length < 2 && (
            <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Waiting for opponent to join...
            </p>
          )}
          {game.host !== uid && (
            <p style={{ textAlign: "center", color: "var(--text-secondary)", fontSize: 13 }}>
              Waiting for host to start...
            </p>
          )}
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
          <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>Checkers Champion! 🔴</div>
        </div>
        <div style={styles.card}>
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
  if (!game || !game.board || game.board.length === 0) {
    return <div style={styles.loading}>Loading game...</div>;
  }

  const myPlayerIndex = game.players.indexOf(uid);
  const isMyTurn = game.players[game.currentPlayerIndex] === uid;
  const currentPlayerName = game.playerNames?.[game.players[game.currentPlayerIndex]] || "?";
  const validDests = validMoves.map(m => m.to);
  const board2D = unflattenBoard(game.board);

  let p1Count = 0, p2Count = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board2D[r][c];
      if (p === "p1" || p === "p1k") p1Count++;
      if (p === "p2" || p === "p2k") p2Count++;
    }

  const p1Name = game.playerNames?.[game.players[0]] || "Player 1";
  const p2Name = game.playerNames?.[game.players[1]] || "Player 2";

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <button onClick={onExit} style={styles.backBtn}>← Exit</button>
          <div style={{ fontWeight: 700, fontSize: 18 }}>🔴 Checkers</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            {isMyTurn ? "Your turn!" : `${currentPlayerName}'s turn`}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 500, margin: "0 auto", padding: "0 12px 24px" }}>
        <div style={styles.statusBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#533AB7" }} />
            <span style={{ fontWeight: 600 }}>{p1Name}: {p1Count}</span>
          </div>
          <div style={{ fontWeight: 700, color: isMyTurn ? "#1D9E75" : "var(--text-secondary)" }}>
            {isMyTurn ? "🟢 Your Turn!" : `⏳ ${currentPlayerName}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{p2Name}: {p2Count}</span>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#1D9E75" }} />
          </div>
        </div>

        {game.lastAction && (
          <div style={styles.lastAction}>{game.lastAction}</div>
        )}

        {message && <div style={styles.message}>{message}</div>}

        {game.mustJumpFrom && isMyTurn && (
          <div style={{ ...styles.message, background: "#E8F5E9", color: "#1D9E75" }}>
            ⚡ Multi-jump available! Keep jumping!
          </div>
        )}

        <div style={styles.boardContainer}>
          <div style={styles.board}>
            {board2D.map((row, rIdx) =>
              row.map((cell, cIdx) => {
                const isDark = (rIdx + cIdx) % 2 === 1;
                const isSelected = selected && selected[0] === rIdx && selected[1] === cIdx;
                const isValidDest = validDests.some(([r, c]) => r === rIdx && c === cIdx);
                const isMustJump = game.mustJumpFrom &&
                  game.mustJumpFrom[0] === rIdx && game.mustJumpFrom[1] === cIdx;
                return (
                  <div key={`${rIdx}-${cIdx}`}
                    onClick={() => isDark && handleCellClick(rIdx, cIdx)}
                    style={{
                      width: "12.5%", aspectRatio: "1",
                      background: isSelected ? "#FDD835"
                        : isValidDest ? "#A5D6A7"
                        : isDark ? "#2C3E50" : "#ECF0F1",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: isDark ? "pointer" : "default",
                      border: isMustJump ? "2px solid #1D9E75" : "none",
                      transition: "background 0.15s",
                      position: "relative",
                    }}>
                    {cell && (
                      <div style={{
                        width: "75%", height: "75%", borderRadius: "50%",
                        background: (cell === "p1" || cell === "p1k")
                          ? "linear-gradient(135deg, #7C3AED, #533AB7)"
                          : "linear-gradient(135deg, #059669, #1D9E75)",
                        border: "2px solid rgba(255,255,255,0.4)",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 16, color: "white", fontWeight: 800,
                      }}>
                        {isKing(cell) ? "♛" : ""}
                      </div>
                    )}
                    {isValidDest && !cell && (
                      <div style={{
                        width: 14, height: 14, borderRadius: "50%",
                        background: "rgba(29,158,117,0.5)",
                        border: "2px solid #1D9E75",
                      }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 20, marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%",
              background: "linear-gradient(135deg, #7C3AED, #533AB7)" }} />
            <span>{p1Name} {myPlayerIndex === 0 ? "(You)" : ""}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <div style={{ width: 16, height: 16, borderRadius: "50%",
              background: "linear-gradient(135deg, #059669, #1D9E75)" }} />
            <span>{p2Name} {myPlayerIndex === 1 ? "(You)" : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight: "100vh", background: "var(--bg)", paddingBottom: 40 },
  header: {
    background: "linear-gradient(135deg, #533AB7, #1D9E75)",
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
  boardContainer: {
    borderRadius: 12, overflow: "hidden",
    boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
    border: "3px solid #2C3E50",
  },
  board: { display: "flex", flexWrap: "wrap", width: "100%" },
  playerRow: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "8px 0", borderBottom: "1px solid var(--border)",
  },
  avatar: {
    width: 32, height: 32, borderRadius: "50%",
    color: "white", display: "flex", alignItems: "center",
    justifyContent: "center", fontWeight: 700, fontSize: 14,
  },
  pieceBadge: {
    color: "white", borderRadius: 10, padding: "2px 8px",
    fontSize: 11, fontWeight: 700,
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