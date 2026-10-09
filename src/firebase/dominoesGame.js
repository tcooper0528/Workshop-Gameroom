// ── Dominoes Game Logic ──────────────────────────────────────
import { shuffle } from "lodash";

// Build a full double-6 set of 28 tiles
export function buildDominoSet() {
  const tiles = [];
  let id = 0;
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      tiles.push({ id: id++, a, b });
    }
  }
  return shuffle(tiles);
}

// Deal tiles to players
export function dealTiles(tiles, playerIds) {
  const hands = {};
  const remaining = [...tiles];
  const tilesPerPlayer = playerIds.length <= 2 ? 7 : 5;

  for (const pid of playerIds) {
    hands[pid] = remaining.splice(0, tilesPerPlayer);
  }

  return { hands, boneyard: remaining };
}

export function initGameState(playerIds) {
  const tiles = buildDominoSet();
  const { hands, boneyard } = dealTiles(tiles, playerIds);

  // Find who goes first — player with highest double
  let firstPlayer = 0;
  let highestDouble = -1;
  for (let i = 0; i < playerIds.length; i++) {
    for (const tile of hands[playerIds[i]]) {
      if (tile.a === tile.b && tile.a > highestDouble) {
        highestDouble = tile.a;
        firstPlayer = i;
      }
    }
  }

  // Serialize hands for Firebase (no nested objects issues)
  const serializedHands = {};
  for (const pid of playerIds) {
    serializedHands[pid] = hands[pid].map(t => `${t.id}:${t.a}:${t.b}`);
  }

  const serializedBoneyard = boneyard.map(t => `${t.id}:${t.a}:${t.b}`);

  return {
    players: playerIds,
    hands: serializedHands,
    boneyard: serializedBoneyard,
    chain: [], // played tiles on the board
    leftEnd: null, // left end value of chain
    rightEnd: null, // right end value of chain
    currentPlayerIndex: firstPlayer,
    status: "playing",
    winner: null,
    lastAction: null,
    passCount: 0, // consecutive passes — if all pass, game is blocked
  };
}

// Parse tile string "id:a:b"
export function parseTile(str) {
  const [id, a, b] = str.split(":").map(Number);
  return { id, a, b };
}

// Serialize tile to string
export function serializeTile(tile) {
  return `${tile.id}:${tile.a}:${tile.b}`;
}

// Check if a tile can be played on either end
export function canPlayTile(tile, leftEnd, rightEnd) {
  if (leftEnd === null) return true; // First tile
  return tile.a === leftEnd || tile.b === leftEnd ||
    tile.a === rightEnd || tile.b === rightEnd;
}

// Get valid ends a tile can play on
export function getPlayableEnds(tile, leftEnd, rightEnd) {
  const ends = [];
  if (leftEnd === null) return ["left"]; // first tile
  if (tile.a === leftEnd || tile.b === leftEnd) ends.push("left");
  if (tile.a === rightEnd || tile.b === rightEnd) ends.push("right");
  return ends;
}

// Apply a tile play to the chain
export function applyPlay(chain, tile, end, leftEnd, rightEnd) {
  const newChain = [...chain];
  let newLeft = leftEnd;
  let newRight = rightEnd;

  if (leftEnd === null) {
    // First tile
    newChain.push({ ...tile, flipped: false });
    newLeft = tile.a;
    newRight = tile.b;
  } else if (end === "left") {
    const flipped = tile.b === leftEnd;
    newChain.unshift({ ...tile, flipped });
    newLeft = flipped ? tile.a : tile.b;
  } else {
    const flipped = tile.a === rightEnd;
    newChain.push({ ...tile, flipped });
    newRight = flipped ? tile.b : tile.a;
  }

  return { newChain, newLeft, newRight };
}

// Check if a player has won (empty hand)
export function checkWinner(hands, playerId) {
  return hands[playerId].length === 0;
}

// Calculate score (sum of remaining pips for losers)
export function calculateScore(hands, playerIds) {
  const scores = {};
  for (const pid of playerIds) {
    scores[pid] = hands[pid]
      .map(parseTile)
      .reduce((sum, t) => sum + t.a + t.b, 0);
  }
  return scores;
}

// Check if game is blocked (no one can play)
export function isBlocked(hands, playerIds, leftEnd, rightEnd) {
  for (const pid of playerIds) {
    for (const tileStr of hands[pid]) {
      const tile = parseTile(tileStr);
      if (canPlayTile(tile, leftEnd, rightEnd)) return false;
    }
  }
  return true;
}