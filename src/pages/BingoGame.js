import { useState, useEffect, useRef } from "react";
import { doc, onSnapshot, updateDoc, setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import GameLobby from "../components/GameLobby";
import CardBack from "../components/CardBack";

// ── Bingo Items ───────────────────────────────────────────────
const ANIMALS = [
  "🐶 Dog","🐱 Cat","🐭 Mouse","🐹 Hamster","🐰 Rabbit",
  "🦊 Fox","🐻 Bear","🐼 Panda","🐨 Koala","🐯 Tiger",
  "🦁 Lion","🐮 Cow","🐷 Pig","🐸 Frog","🐵 Monkey",
  "🐔 Chicken","🐧 Penguin","🐦 Bird","🦆 Duck","🦅 Eagle",
  "🦉 Owl","🦇 Bat","🐺 Wolf","🐗 Boar","🐴 Horse",
  "🦄 Unicorn","🐝 Bee","🐛 Worm","🦋 Butterfly","🐌 Snail",
  "🐞 Ladybug","🐜 Ant","🦟 Mosquito","🦗 Cricket","🕷️ Spider",
  "🦂 Scorpion","🐢 Turtle","🐍 Snake","🦎 Lizard","🦖 Dino",
];

const SHAPES = [
  "⭕ Circle","🔺 Triangle","⬛ Square","🔷 Diamond","⭐ Star",
  "❤️ Heart","🌙 Moon","☀️ Sun","🔶 Hexagon","🔸 Pentagon",
  "🔹 Oval","➕ Cross","🔲 Rectangle","🔳 Octagon","💠 Crystal",
  "🌀 Spiral","🔱 Trident","♾️ Infinity","🔰 Shield","🪄 Wand",
];

const NUMBERS = Array.from({ length: 75 }, (_, i) => `${i + 1}`);

function getItemPool(category) {
  if (category === "animals") return ANIMALS;
  if (category === "shapes") return SHAPES;
  if (category === "numbers") return NUMBERS;
  // Mixed
  return [...ANIMALS.slice(0, 20), ...SHAPES.slice(0, 10), ...NUMBERS.slice(0, 20)];
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function buildCard(category) {
  const pool = shuffle(getItemPool(category));
  const items = pool.slice(0, 24);
  items.splice(12, 0, "FREE"); // middle free space
  return items;
}

function checkWinner(marked, winMode) {
  const size = 5;
  if (winMode === "blackout") {
    return marked.length === 25;
  }
  // Check rows
  for (let r = 0; r < size; r++) {
    if ([0,1,2,3,4].every(c => marked.includes(r * size + c))) return true;
  }
  // Check cols
  for (let c = 0; c < size; c++) {
    if ([0,1,2,3,4].every(r => marked.includes(r * size + c))) return true;
  }
  // Check diagonals
  if ([0,6,12,18,24].every(i => marked.includes(i))) return true;
  if ([4,8,12,16,20].every(i => marked.includes(i))) return true;
  return false;
}

const COLORS = ["#533AB7","#1D9E75","#D4537E","#BA7517"];

export default function BingoGame({ onExit }) {
  const { currentUser } = useAuth();
  const uid = currentUser.uid;
  const name = currentUser.displayName || "Player";

  const [screen, setScreen] = useState("menu");
  const [roomId, setRoomId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [game, setGame] = useState(null);
  const [myCard, setMyCard] = useState(null);
  const [myMarked, setMyMarked] = useState([12]); // FREE space auto-marked
  const [won, setWon] = useState(false);
  const [category, setCategory] = useState("mixed");
  const [winMode, setWinMode] = useState("standard");
  const timerRef = useRef(null);
  const [lastCalled, setLastCalled] = useState(null);
  const [showCalled, setShowCalled] = useState(false);
  const [calledFlipped, setCalledFlipped] = useState(false); // drives the card flip

  // Listen to game
  useEffect(() => {
    if (!roomId) return;
    const gameRef = doc(db, "bingoGames", roomId);
    const unsub = onSnapshot(gameRef, snap => {
      if (snap.exists()) {
        const data = snap.data();
        setGame(data);
        if (data.status === "waiting") setScreen("waiting");
        if (data.status === "playing") {
          setScreen("game");
          // Load my card
          if (data.cards?.[uid] && !myCard) {
            setMyCard(data.cards[uid]);
          }
          // Show new call animation: card back first, then flip to reveal
          if (data.calledItems?.length > 0) {
            const latest = data.calledItems[data.calledItems.length - 1];
            if (latest !== lastCalled) {
              setLastCalled(latest);
              setCalledFlipped(false);   // start showing the Workshop card back
              setShowCalled(true);
              setTimeout(() => setCalledFlipped(true), 500);   // flip to reveal
              setTimeout(() => setShowCalled(false), 3000);     // then dismiss
            }
          }
        }
        if (data.status === "finished") setScreen("game");
      } else {
        setGame(null);
        setRoomId(null);
        setScreen("menu");
        showMsg("The host closed that room.");
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, uid, myCard, lastCalled]);

  // Auto-caller timer for host
useEffect(() => {
    if (screen !== "game" || !game || game.status !== "playing") return;
    if (game.host !== uid) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(callNext, 15000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, game?.status, game?.calledItems?.length]);

  function showMsg(msg) {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  }

  async function createGame() {
    setLoading(true);
    try {
      const id = "BINGO-" + Math.random().toString(36).slice(2, 6).toUpperCase();
      const myCardData = buildCard(category);
      await setDoc(doc(db, "bingoGames", id), {
        players: [uid],
        playerNames: { [uid]: name },
        status: "waiting",
        host: uid,
        createdAt: Date.now(),
        category,
        winMode,
        calledItems: [],
        cards: { [uid]: myCardData },
        winner: null,
        lastAction: null,
      });
      setMyCard(myCardData);
      setMyMarked([12]);
      setWon(false);
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
      const snap = await getDoc(doc(db, "bingoGames", id));
      if (!snap.exists()) { showMsg("❌ That room just closed. Pick another!"); setLoading(false); return; }
      const data = snap.data();
      if (data.players?.includes(uid)) { setRoomId(id); setLoading(false); return; }
      if (data.status !== "waiting") { showMsg("❌ That game already started!"); setLoading(false); return; }
      const myCardData = buildCard(data.category);
      await updateDoc(doc(db, "bingoGames", id), {
        players: [...(data.players || []), uid],
        playerNames: { ...data.playerNames, [uid]: name },
        cards: { ...data.cards, [uid]: myCardData },
      });
      setMyCard(myCardData);
      setMyMarked([12]);
      setWon(false);
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
    setScreen("menu");
    try {
      if (!id || !game) return;
      const gameRef = doc(db, "bingoGames", id);
      if (game.host === uid) {
        await deleteDoc(gameRef);
      } else {
        const newPlayers = (game.players || []).filter(p => p !== uid);
        const newNames = { ...game.playerNames };
        delete newNames[uid];
        const newCards = { ...game.cards };
        delete newCards[uid];
        await updateDoc(gameRef, { players: newPlayers, playerNames: newNames, cards: newCards });
      }
    } catch (err) {
      console.error("Leave room cleanup failed:", err);
    }
  }

  async function startGame() {
    if (!game || game.players.length < 2) { showMsg("Need at least 2 players!"); return; }
    setLoading(true);
    await updateDoc(doc(db, "bingoGames", roomId), { status: "playing" });
    setLoading(false);
  }

  async function callNext() {
    if (!game || game.status !== "playing") return;
    const pool = getItemPool(game.category);
    const remaining = pool.filter(item => !game.calledItems.includes(item));
    if (remaining.length === 0) { showMsg("All items called!"); return; }
    const next = remaining[Math.floor(Math.random() * remaining.length)];
    await updateDoc(doc(db, "bingoGames", roomId), {
      calledItems: [...game.calledItems, next],
      lastAction: `Called: ${next}`,
    });
  }

  function markCell(index) {
    if (!myCard || myCard[index] === "FREE") return;
    if (!game?.calledItems?.includes(myCard[index])) {
      showMsg("That item hasn't been called yet!");
      return;
    }
    if (myMarked.includes(index)) return;
    const newMarked = [...myMarked, index];
    setMyMarked(newMarked);
    if (checkWinner(newMarked, game.winMode)) {
      setWon(true);
      declareBingo(newMarked);
    }
  }

  async function declareBingo(marked) {
    await updateDoc(doc(db, "bingoGames", roomId), {
      status: "finished",
      winner: uid,
      winnerCard: marked,
      lastAction: `${name} called BINGO! 🎉`,
    });
  }

  async function resetGame() {
    const newCards = {};
    for (const pid of game.players) {
      newCards[pid] = buildCard(game.category);
    }
    await updateDoc(doc(db, "bingoGames", roomId), {
      status: "waiting", calledItems: [], winner: null,
      lastAction: null, cards: newCards,
    });
    setMyCard(newCards[uid]);
    setMyMarked([12]);
    setWon(false);
    setLastCalled(null);
  }

  // ── Menu ──────────────────────────────────────────────────
  if (screen === "menu") {
    return (
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={onExit} style={s.backBtn}>← Exit</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36 }}>🎱</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>Bingo!</div>
            <div style={{ fontSize: 13, opacity: 0.85 }}>Animals · Shapes · Numbers</div>
          </div>
          <div style={{ width: 60 }} />
        </div>

        <div style={{ maxWidth: 500, margin: "0 auto", padding: "0 16px 40px" }}>
          {message && <div style={s.message}>{message}</div>}

          <div style={s.card}>
            <div style={s.cardTitle}>🎯 Choose Category</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                { val: "mixed", label: "🎲 Mixed", desc: "Animals + Shapes + Numbers" },
                { val: "animals", label: "🐾 Animals", desc: "All animal cards" },
                { val: "shapes", label: "🔷 Shapes", desc: "All shape cards" },
                { val: "numbers", label: "🔢 Numbers", desc: "Classic number bingo" },
              ].map(opt => (
                <div key={opt.val} onClick={() => setCategory(opt.val)}
                  style={{
                    padding: "12px", borderRadius: 12, cursor: "pointer",
                    textAlign: "center", transition: "all 0.15s",
                    background: category === opt.val ? "#533AB7" : "var(--bg)",
                    color: category === opt.val ? "white" : "var(--text)",
                    border: category === opt.val ? "none" : "1px solid var(--border)",
                    boxShadow: category === opt.val ? "0 4px 12px rgba(83,58,183,0.3)" : "none",
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>🏆 Win Condition</div>
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { val: "standard", label: "📋 Standard", desc: "One line wins" },
                { val: "blackout", label: "⬛ Blackout", desc: "Full card wins" },
              ].map(opt => (
                <div key={opt.val} onClick={() => setWinMode(opt.val)}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 12, cursor: "pointer",
                    textAlign: "center", transition: "all 0.15s",
                    background: winMode === opt.val ? "#D4537E" : "var(--bg)",
                    color: winMode === opt.val ? "white" : "var(--text)",
                    border: winMode === opt.val ? "none" : "1px solid var(--border)",
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.card}>
            <div style={s.cardTitle}>🎮 How do you want to play?</div>
            <GameLobby
              collectionName="bingoGames"
              emoji="🎱"
              maxPlayers={12}
              onCreate={createGame}
              onJoin={joinRoom}
              loading={loading}
              createLabel="🎱 Create Bingo Game"
            />
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
            <div style={{ fontSize: 22, fontWeight: 800 }}>🎱 Bingo!</div>
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

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <span style={{ ...s.badge, background: "#533AB7", color: "white" }}>
                {game.category === "mixed" ? "🎲 Mixed" : game.category === "animals" ? "🐾 Animals" : game.category === "shapes" ? "🔷 Shapes" : "🔢 Numbers"}
              </span>
              <span style={{ ...s.badge, background: "#D4537E", color: "white" }}>
                {game.winMode === "blackout" ? "⬛ Blackout" : "📋 Standard"}
              </span>
              <span style={{ ...s.badge, background: "#1D9E75", color: "white" }}>
                ⏱ 15s auto-call
              </span>
            </div>

            {/* Rules */}
            <div style={{ background: "linear-gradient(135deg, #533AB7, #D4537E)",
              borderRadius: 12, padding: 16, color: "white", marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>🎱 How to Play</div>
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <div>📢 The <strong>Robot Caller</strong> calls an item every 15 seconds</div>
                <div>👆 <strong>Tap your card</strong> when you have the called item</div>
                <div>✅ Mark <strong>{game.winMode === "blackout" ? "the whole card" : "a full line"}</strong> to win</div>
                <div>🎉 Be first to shout <strong>BINGO!</strong></div>
                <div style={{ marginTop: 8, padding: "6px 10px",
                  background: "rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}>
                  💡 <em>Your FREE space in the middle is already marked!</em>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Players ({game.players.length}):</div>
              {game.players.map((pid, i) => (
                <div key={pid} style={s.playerRow}>
                  <div style={{ ...s.avatar, background: COLORS[i % COLORS.length] }}>
                    {(game.playerNames?.[pid] || "?")[0]}
                  </div>
                  <span>{game.playerNames?.[pid]}</span>
                  {pid === game.host && <span style={s.hostBadge}>Host</span>}
                  {pid === uid && <span style={s.youBadge}>You</span>}
                </div>
              ))}
            </div>

            {game.host === uid && game.players.length >= 2 && (
              <button style={s.btnGreen} onClick={startGame} disabled={loading}>
                {loading ? "Starting..." : "🎱 Start Bingo!"}
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
          </div>
        </div>
      </div>
    );
  }

  // ── Active Game ───────────────────────────────────────────
  if (screen === "game" && game && myCard) {
    const isHost = game.host === uid;
    const calledItems = game.calledItems || [];
    const lastItem = calledItems[calledItems.length - 1];
    const winnerName = game.playerNames?.[game.winner] || "Someone";

    return (
      <div style={s.container}>
        {/* Called item reveal — Workshop card back flips over to show the item */}
        {showCalled && lastItem && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(83,58,183,0.85)", zIndex: 200,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column", color: "white",
          }}>
            <div style={{ fontSize: 16, opacity: 0.85, marginBottom: 18, letterSpacing: 2 }}>
              CALLED!
            </div>

            <div style={{ perspective: 1200 }}>
              <div style={{
                position: "relative", width: 210, height: 327,
                transformStyle: "preserve-3d",
                transition: "transform 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)",
                transform: calledFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              }}>
                {/* Front — the Workshop card back */}
                <div style={{
                  position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                  backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
                }}>
                  <CardBack fill rounded={18} />
                </div>

                {/* Back — the called item */}
                <div style={{
                  position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                  backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
                  transform: "rotateY(180deg)", borderRadius: 18,
                  background: "linear-gradient(135deg, #533AB7, #D4537E)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  textAlign: "center", padding: 20,
                  border: "3px solid rgba(255,255,255,0.35)",
                  boxShadow: "0 10px 34px rgba(0,0,0,0.4)",
                }}>
                  <div style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.25 }}>
                    {lastItem}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 18 }}>
              {calledItems.length} items called
            </div>
          </div>
        )}

        <div style={s.header}>
          <button onClick={() => setScreen("menu")} style={s.backBtn}>← Exit</button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>🎱 BINGO</div>
            <div style={{ fontSize: 11, opacity: 0.85 }}>{calledItems.length} called</div>
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, textAlign: "right" }}>
            {game.winMode === "blackout" ? "⬛ Blackout" : "📋 Standard"}
          </div>
        </div>

        <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 12px 40px" }}>

          {/* Winner banner */}
          {game.status === "finished" && (
            <div style={{ background: "linear-gradient(135deg, #F9A825, #F57F17)",
              borderRadius: 16, padding: "20px 24px", marginBottom: 16,
              textAlign: "center", color: "white" }}>
              <div style={{ fontSize: 40 }}>🏆</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{winnerName} wins!</div>
              <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>BINGO! 🎉</div>
              {isHost && (
                <button onClick={resetGame}
                  style={{ marginTop: 14, background: "white", color: "#F57F17",
                    border: "none", borderRadius: 10, padding: "10px 24px",
                    fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
                  🔄 Play Again
                </button>
              )}
            </div>
          )}

          {/* Last called + host controls */}
          <div style={{ ...s.card, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 4 }}>Last Called:</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "#533AB7" }}>
                  {lastItem || "—"}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                {isHost && game.status === "playing" && (
                  <button onClick={callNext}
                    style={{ background: "#533AB7", color: "white", border: "none",
                      borderRadius: 10, padding: "10px 18px", fontWeight: 700,
                      fontSize: 14, cursor: "pointer" }}>
                    📢 Call Now!
                  </button>
                )}
                {!isHost && game.status === "playing" && (
                  <div style={{ fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic" }}>
                    🤖 Robot Caller active
                  </div>
                )}
                {won && game.status !== "finished" && (
                  <div style={{ fontSize: 13, color: "#1D9E75", fontWeight: 700 }}>
                    🎉 You got BINGO!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Players */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {game.players.map((pid, i) => (
              <div key={pid} style={{
                ...s.playerChip,
                background: COLORS[i % COLORS.length],
                color: "white",
              }}>
                <span style={{ fontWeight: 700 }}>{pid === uid ? "You" : game.playerNames?.[pid]}</span>
                {pid === game.winner && <span style={{ marginLeft: 6 }}>🏆</span>}
              </div>
            ))}
          </div>

          {/* My Bingo Card */}
          <div style={{ background: "var(--bg-card)", borderRadius: 16,
            padding: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", marginBottom: 16 }}>
            <div style={{ textAlign: "center", fontWeight: 700, fontSize: 16,
              marginBottom: 10, letterSpacing: 6, color: "#533AB7" }}>
              B · I · N · G · O
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
              {myCard.map((item, idx) => {
                const isFree = item === "FREE";
                const isMarked = myMarked.includes(idx);
                const isCalled = calledItems.includes(item);
                const isNew = item === lastItem;
                return (
                  <div key={idx} onClick={() => !isFree && game.status === "playing" && markCell(idx)}
                    style={{
                      aspectRatio: "1", borderRadius: 10,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      textAlign: "center", fontSize: item.length > 6 ? 9 : item.length > 3 ? 11 : 14,
                      fontWeight: isMarked ? 800 : 600, lineHeight: 1.2,
                      cursor: isFree || !isCalled || isMarked ? "default" : "pointer",
                      background: isFree ? "linear-gradient(135deg, #F9A825, #F57F17)"
                        : isMarked ? "linear-gradient(135deg, #533AB7, #1D9E75)"
                        : isCalled ? "#E8F5E9"
                        : "var(--bg)",
                      color: isFree || isMarked ? "white" : isCalled ? "#1D9E75" : "var(--text)",
                      border: isNew ? "2.5px solid #533AB7"
                        : isMarked ? "none"
                        : "1px solid var(--border)",
                      boxShadow: isMarked ? "0 2px 8px rgba(83,58,183,0.3)" : "none",
                      transition: "all 0.2s", padding: 2,
                    }}>
                    {isFree ? "⭐\nFREE" : item.includes(" ") ? item : item}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Called items log */}
          <div style={s.card}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
              📋 Called Items ({calledItems.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {calledItems.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>
                  Waiting for first call...
                </div>
              ) : (
                calledItems.map((item, i) => (
                  <span key={i} style={{
                    background: myCard.includes(item) ? "#EEEDFE" : "var(--bg)",
                    color: myCard.includes(item) ? "#533AB7" : "var(--text-secondary)",
                    border: `1px solid ${myCard.includes(item) ? "#533AB7" : "var(--border)"}`,
                    borderRadius: 8, padding: "3px 8px", fontSize: 12, fontWeight: 600,
                  }}>
                    {item}
                  </span>
                ))
              )}
            </div>
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
  badge: {
    borderRadius: 10, padding: "4px 12px", fontSize: 12, fontWeight: 600,
  },
  playerChip: {
    borderRadius: 20, padding: "6px 14px", fontSize: 13,
    display: "flex", alignItems: "center",
  },
};