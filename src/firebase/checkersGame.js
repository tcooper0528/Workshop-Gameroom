// ── Checkers Game Logic ──────────────────────────────────────

export const EMPTY = null;
export const P1 = "p1";
export const P2 = "p2";
export const P1K = "p1k";
export const P2K = "p2k";

export function initBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(EMPTY));
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) board[row][col] = P2;
        if (row > 4) board[row][col] = P1;
      }
    }
  }
  return board;
}

// Flatten 2D board to 1D for Firebase
export function flattenBoard(board) {
  return board.reduce((acc, row) => [...acc, ...row], []);
}

// Unflatten 1D board back to 2D
export function unflattenBoard(flat) {
  const board = [];
  for (let i = 0; i < 8; i++) {
    board.push(flat.slice(i * 8, i * 8 + 8));
  }
  return board;
}

export function initGameState(playerIds) {
  return {
    board: flattenBoard(initBoard()),
    players: playerIds,
    currentPlayerIndex: 0,
    status: "playing",
    winner: null,
    lastAction: null,
    mustJumpFrom: null,
  };
}

export function isKing(piece) {
  return piece === P1K || piece === P2K;
}

export function pieceOwner(piece) {
  if (piece === P1 || piece === P1K) return P1;
  if (piece === P2 || piece === P2K) return P2;
  return null;
}

export function getValidMoves(board, row, col, mustJumpFrom = null) {
  const piece = board[row][col];
  if (!piece) return [];

  const owner = pieceOwner(piece);
  const moves = [];
  const jumps = [];

  let dirs = [];
  if (piece === P1 || piece === P1K) dirs.push([-1, -1], [-1, 1]);
  if (piece === P2 || piece === P2K) dirs.push([1, -1], [1, 1]);
  if (isKing(piece)) dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  for (const [dr, dc] of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    const jr = row + dr * 2;
    const jc = col + dc * 2;

    if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === EMPTY) {
      moves.push({ from: [row, col], to: [nr, nc], jump: false });
    }

    if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8) {
      const middle = board[nr]?.[nc];
      if (middle && pieceOwner(middle) !== owner && board[jr][jc] === EMPTY) {
        jumps.push({ from: [row, col], to: [jr, jc], jumped: [nr, nc], jump: true });
      }
    }
  }

  if (jumps.length > 0) return jumps;
  if (mustJumpFrom) return [];
  return moves;
}

export function getAllValidMoves(board, playerPiece, mustJumpFrom = null) {
  const allMoves = [];
  const allJumps = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || pieceOwner(piece) !== playerPiece) continue;
      if (mustJumpFrom && (mustJumpFrom[0] !== row || mustJumpFrom[1] !== col)) continue;

      const moves = getValidMoves(board, row, col, mustJumpFrom);
      for (const m of moves) {
        if (m.jump) allJumps.push(m);
        else allMoves.push(m);
      }
    }
  }

  return allJumps.length > 0 ? allJumps : allMoves;
}

export function applyMove(board, move) {
  const newBoard = board.map(r => [...r]);
  const [fr, fc] = move.from;
  const [tr, tc] = move.to;
  let piece = newBoard[fr][fc];

  newBoard[fr][fc] = EMPTY;

  if (move.jumped) {
    const [jr, jc] = move.jumped;
    newBoard[jr][jc] = EMPTY;
  }

  if (piece === P1 && tr === 0) piece = P1K;
  if (piece === P2 && tr === 7) piece = P2K;

  newBoard[tr][tc] = piece;
  return newBoard;
}

export function checkWinner(board, nextPlayerPiece) {
  const moves = getAllValidMoves(board, nextPlayerPiece);
  if (moves.length === 0) return true;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (pieceOwner(board[r][c]) === nextPlayerPiece) return false;
    }
  }
  return true;
}