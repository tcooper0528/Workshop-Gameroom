import { useState } from "react";
import SwitcherooGame from "./SwitcherooGame";
import CheckersGame from "./CheckersGame";
import DominoesGame from "./DominoesGame";
import MatchingGame from "./MatchingGame";
import BingoGame from "./BingoGame";

// ── The game shelf ────────────────────────────────────────────
// To add a game later: build its page, import it above, and add
// one entry here. `component` games run inside the app; `iframe`
// games are self-contained HTML files in the /public folder.
const GAMES = [
  {
    id: "switcheroo",
    name: "One Switcheroo",
    icon: "🔀",
    players: "2–6 players",
    blurb: "Match colors and numbers, play your power cards, and shout Switcheroo on your last card!",
    component: SwitcherooGame,
  },
  {
    id: "matching",
    name: "Matching",
    icon: "🎴",
    players: "1–4 players",
    blurb: "Flip cards to find the pairs. Play solo against the clock or take turns with friends.",
    component: MatchingGame,
  },
  {
    id: "bingo",
    name: "Bingo",
    icon: "🎱",
    players: "2–12 players",
    blurb: "Mark your card as the items are called. First to get a line wins!",
    component: BingoGame,
  },
  {
    id: "checkers",
    name: "Checkers",
    icon: "🔴",
    players: "2 players",
    blurb: "The classic. Jump your way across the board and get kinged.",
    component: CheckersGame,
  },
  {
    id: "dominoes",
    name: "Dominoes",
    icon: "🁢",
    players: "2–4 players",
    blurb: "Match the ends and be the first to play every tile.",
    component: DominoesGame,
  },
  {
    id: "noodle",
    name: "Noodle Nibblers",
    icon: "🐛",
    players: "1–4 on one screen",
    blurb: "Eat, glow, grow, and don't bump into anybody. Play together on one device.",
    iframe: "/noodle-nibblers.html",
  },
];

export default function Games() {
  const [active, setActive] = useState(null);
  const game = GAMES.find((g) => g.id === active);
  const exit = () => setActive(null);

  if (game?.component) {
    const GameComponent = game.component;
    return <GameComponent onExit={exit} />;
  }

  if (game?.iframe) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#0a0a14", zIndex: 1000,
        display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", background: "#12122a", color: "#eaeaff" }}>
          <button onClick={exit}
            style={{ background: "#1a1a3a", color: "#eaeaff", border: "1px solid #333366",
              borderRadius: 8, padding: "8px 14px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            ← Back to Games
          </button>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{game.icon} {game.name}</div>
          <div style={{ width: 110 }} />
        </div>
        <iframe
          src={game.iframe}
          title={game.name}
          style={{ flex: 1, width: "100%", border: "none" }}
          allow="fullscreen; accelerometer; gyroscope"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="hero-banner">
        <div className="hero-emoji">🎲</div>
        <div className="hero-text">Pick a game and play!</div>
        <div className="hero-sub">
          Make a room and friends can tap it to join. No sign-up, no chat, just games.
        </div>
      </div>

      <div className="grid-3">
        {GAMES.map((g) => (
          <div key={g.id} className="card" style={{ display: "flex", flexDirection: "column", marginBottom: 0 }}>
            <div style={{ fontSize: 40, textAlign: "center" }}>{g.icon}</div>
            <div className="card-title" style={{ textAlign: "center", marginTop: 6, marginBottom: 4 }}>
              {g.name}
            </div>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-secondary)", marginBottom: 8 }}>
              {g.players}
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--text-secondary)", flex: 1, marginBottom: 12 }}>
              {g.blurb}
            </div>
            <button className="btn btn-primary btn-full" onClick={() => setActive(g.id)}>
              Play ▶
            </button>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-secondary)", margin: "28px 0 8px" }}>
        Made with ❤️ by Pop's Workshop · Rooms clear themselves out after a day.
      </div>
    </div>
  );
}
