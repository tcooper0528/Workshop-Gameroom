import "@testing-library/jest-dom";
import { render, screen, fireEvent, act } from "@testing-library/react";
import App from "./App";

jest.mock("./firebase/config", () => ({
  firebaseReady: true,
  auth: { currentUser: { uid: "guest-1", displayName: null } },
  db: {},
}));

jest.mock("firebase/auth", () => ({
  onAuthStateChanged: (auth, cb) => {
    cb(auth.currentUser);
    return () => {};
  },
  signInAnonymously: () => {},
  updateProfile: async (user, p) => {
    user.displayName = p.displayName;
  },
}));

jest.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => {},
  limit: () => {},
  doc: () => ({}),
  onSnapshot: (q, cb) => {
    cb({ docs: [], exists: () => false });
    return () => {};
  },
  getDocs: async () => ({ docs: [] }),
  getDoc: async () => ({ exists: () => false }),
  setDoc: async () => {},
  updateDoc: async () => {},
  deleteDoc: async () => {},
}));

// Each test starts as a brand-new visitor with no nickname yet
beforeEach(() => {
  require("./firebase/config").auth.currentUser.displayName = null;
});

async function enterGameroom(name = "Happy Otter") {
  render(<App />);
  const input = await screen.findByLabelText(/your player name/i);
  fireEvent.change(input, { target: { value: name } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /let's play/i }));
  });
}

test("blocks a rude nickname", async () => {
  render(<App />);
  const input = await screen.findByLabelText(/your player name/i);
  fireEvent.change(input, { target: { value: "B00B" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /let's play/i }));
  });
  expect(screen.getByText(/friendlier name/i)).toBeInTheDocument();
});

test("nickname leads to the game shelf with all six games", async () => {
  await enterGameroom();
  expect(screen.getByText(/pick a game and play/i)).toBeInTheDocument();
  for (const g of ["One Switcheroo", "Matching", "Bingo", "Checkers", "Dominoes", "Noodle Nibblers"]) {
    expect(screen.getByText(g)).toBeInTheDocument();
  }
  expect(screen.getByText(/Happy Otter · Change/)).toBeInTheDocument();
  expect(screen.queryByText(/lolly|family code|UNO/i)).toBeNull();
});

test("Matching: Play Solo starts a board instead of bouncing", async () => {
  await enterGameroom();
  const playButtons = screen.getAllByRole("button", { name: /play ▶/i });
  fireEvent.click(playButtons[1]); // Matching
  fireEvent.click(screen.getByRole("button", { name: /play solo/i }));
  expect(screen.getByText(/Level 1/)).toBeInTheDocument();
  expect(screen.getAllByAltText("Card back")).toHaveLength(6);
  // Win screen → Next Level goes to level 2 (8 cards)
});

test("One Switcheroo opens its lobby with the new name", async () => {
  await enterGameroom();
  fireEvent.click(screen.getAllByRole("button", { name: /play ▶/i })[0]);
  expect(screen.getByText("One Switcheroo")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /create new game/i })).toBeInTheDocument();
});

test("every game opens without crashing", async () => {
  await enterGameroom();
  for (let i = 0; i < 6; i++) {
    const play = screen.getAllByRole("button", { name: /play ▶/i })[i];
    fireEvent.click(play);
    // back to the shelf via the navbar title
    fireEvent.click(screen.getByText(/🎮 Workshop Gameroom/));
    expect(screen.getByText(/pick a game and play/i)).toBeInTheDocument();
  }
});
