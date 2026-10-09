// ── Nicknames ────────────────────────────────────────────────
// Players are strangers, and many will be kids, so names are kept
// short, simple, and friendly:
//   • 2–16 characters
//   • letters, numbers and spaces only (no links, emails, symbols)
//   • a basic word filter catches the obvious bad words
// The easiest path is the "fun name" generator, which only ever
// builds names out of the friendly word lists below.

const ADJECTIVES = [
  "Happy", "Silly", "Speedy", "Brave", "Clever", "Sunny", "Jolly", "Lucky",
  "Bouncy", "Mighty", "Sparkly", "Cozy", "Zippy", "Giggly", "Fuzzy", "Snappy",
  "Breezy", "Peppy", "Twinkly", "Wiggly", "Plucky", "Cheery", "Dizzy", "Nifty",
];

const ANIMALS = [
  "Otter", "Panda", "Fox", "Turtle", "Puppy", "Kitten", "Koala", "Owl",
  "Penguin", "Bunny", "Duck", "Llama", "Moose", "Robin", "Gecko", "Badger",
  "Hedgehog", "Dolphin", "Pony", "Squirrel", "Tiger", "Frog", "Beaver", "Lamb",
];

export function randomNickname() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${a} ${b}`;
}

// Word roots that should never show up in a name. Matching ignores
// spaces, case, and common number-for-letter swaps (0→o, 1→i, 3→e…),
// so "B 0 0 B" style tricks are caught too.
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "asshole",
  "bastard", "slut", "whore", "fag", "nigg", "nigger", "retard", "rape",
  "porn", "sex", "penis", "vagina", "boob", "tits", "nazi", "hitler",
  "suicide", "piss", "jizz", "milf", "horny", "nude", "naked",
  "wtf", "stfu",
];

const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", 9: "g", $: "s", "@": "a" };

function squash(text) {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] || ch)
    .join("")
    .replace(/[^a-z]/g, "");
}

export function cleanNickname(raw) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  if (name.length < 2) return { ok: false, reason: "Names need at least 2 letters." };
  if (name.length > 16) return { ok: false, reason: "Names can be up to 16 characters." };
  if (!/^[A-Za-z0-9 ]+$/.test(name)) {
    return { ok: false, reason: "Use letters, numbers and spaces only." };
  }
  const squashed = squash(name);
  if (BLOCKED.some((w) => squashed.includes(w))) {
    return { ok: false, reason: "Let's pick a friendlier name. Try the 🎲 button!" };
  }
  return { ok: true, name };
}
