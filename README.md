# 🎮 Workshop Gameroom

Free, family-friendly online games from **Pop's Workshop**. No sign-up, no chat: pick a nickname and play.

**Games:** One Switcheroo · Matching · Bingo · Checkers · Dominoes · Noodle Nibblers

## How it works

- **Guest players.** Every visitor gets an invisible guest ID from Firebase *Anonymous* sign-in. Nobody gives an email or password. The only thing a player provides is a nickname (2–16 letters/numbers, with a basic word filter).
- **Rooms.** Multiplayer games use tap-to-join rooms stored in Firestore. Rooms older than a day are deleted automatically whenever someone opens a lobby.
- **Separate from the family hub.** This app uses its own Firebase project, so it can never see the family hub's accounts, photos, or messages.

## Project layout

```
public/
  cardback.webp          shared card back (One Switcheroo, Matching, Bingo, Dominoes)
  cards/                 Matching game pictures
  noodle-nibblers.html   self-contained Noodle Nibblers game
src/
  App.js                 nickname screen → game shelf
  pages/Games.js         the game shelf (add new games here)
  pages/Nickname.js      pick / change your player name
  pages/*Game.js         one file per game
  components/            GameLobby (rooms list), CardBack, Navbar
  context/AuthContext.js guest sign-in + nickname
  firebase/config.js     Firebase project settings
  utils/nickname.js      name generator + word filter
firestore.rules          security rules: paste into the Firebase console
```

## Setup checklist

1. Firebase project created, with **Authentication → Anonymous** turned on
2. **Firestore Database** created, and `firestore.rules` pasted into its **Rules** tab and published
3. Web app config pasted into `src/firebase/config.js`
4. Vercel project imported from this repo (Create React App preset, no settings needed)
5. In Firebase **Authentication → Settings → Authorized domains**, add the Vercel domain

## Run it locally (optional)

```
npm install
npm start
```

Run the click-through tests with `npm test`.
