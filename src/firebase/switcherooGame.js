import { shuffle } from "lodash";

// ── Card Definitions ──────────────────────────────────────────
export const COLORS = ["red", "yellow", "green", "blue"];
export const NUMBERS = ["0","1","2","3","4","5","6","7","8","9"];
export const ACTIONS = ["skip","reverse","draw2"];
export const WILDS = ["wild","wild4"];

export const COLOR_HEX = {
  red: "#E53935",
  yellow: "#FDD835",
  green: "#43A047",
  blue: "#1E88E5",
  wild: "#333",
};

// Build the full 108-card One Switcheroo deck
export function buildDeck() {
  const deck = [];
  let id = 0;

  for (const color of COLORS) {
    // One 0, two of each 1-9
    deck.push({ id: id++, color, value: "0", type: "number" });
    for (const n of NUMBERS.slice(1)) {
      deck.push({ id: id++, color, value: n, type: "number" });
      deck.push({ id: id++, color, value: n, type: "number" });
    }
    // Two of each action per color
    for (const a of ACTIONS) {
      deck.push({ id: id++, color, value: a, type: "action" });
      deck.push({ id: id++, color, value: a, type: "action" });
    }
  }
  // Four of each wild
  for (const w of WILDS) {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: id++, color: "wild", value: w, type: "wild" });
    }
  }
  return shuffle(deck);
}

// Deal 7 cards to each player
export function dealHands(deck, playerIds) {
  const hands = {};
  const remaining = [...deck];
  for (const pid of playerIds) {
    hands[pid] = remaining.splice(0, 7);
  }
  // Flip first card — must not be wild
  let topIndex = remaining.findIndex(c => c.type !== "wild");
  if (topIndex === -1) topIndex = 0;
  const [topCard] = remaining.splice(topIndex, 1);
  return { hands, drawPile: remaining, discardPile: [topCard] };
}

// Can a card be played on the current top card?
export function canPlay(card, topCard, currentColor) {
  if (card.type === "wild") return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

// Get display label for card
export function cardLabel(card) {
  switch (card.value) {
    case "skip": return "⊘";
    case "reverse": return "⇄";
    case "draw2": return "+2";
    case "wild": return "W";
    case "wild4": return "+4";
    default: return card.value;
  }
}

// Get next player index
export function nextPlayerIndex(current, total, direction, skip = false) {
  const step = direction === 1 ? 1 : -1;
  let next = (current + step + total) % total;
  if (skip) next = (next + step + total) % total;
  return next;
}

// Initialize full game state in Firestore format
export function initGameState(playerIds) {
  const deck = buildDeck();
  const { hands, drawPile, discardPile } = dealHands(deck, playerIds);
  return {
    players: playerIds,
    hands,
    drawPile,
    discardPile,
    currentPlayerIndex: 0,
    direction: 1, // 1 = clockwise, -1 = counter
    currentColor: discardPile[0].color,
    status: "playing", // waiting | playing | finished
    winner: null,
    lastAction: null,
    pendingDraw: 0,
    switchCallers: [],
    createdAt: Date.now(),
  };
}