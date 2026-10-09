import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { firebaseReady } from "./firebase/config";
import Navbar from "./components/Navbar";
import Games from "./pages/Games";
import Nickname from "./pages/Nickname";
import "./App.css";

// Workshop Gameroom: one page, no logins.
//   1. Visitor gets an invisible guest ID (see AuthContext)
//   2. They pick a nickname
//   3. They play
function Gameroom() {
  const { loading, error, nickname } = useAuth();
  const [changingName, setChangingName] = useState(false);
  const [homeKey, setHomeKey] = useState(0);

  if (!firebaseReady) {
    return (
      <Message
        emoji="🛠️"
        title="Almost ready!"
        text="Workshop Gameroom isn't connected to its Firebase project yet. Paste the Firebase config into src/firebase/config.js and redeploy."
      />
    );
  }
  if (loading) return <div className="loading">Setting up the game room...</div>;
  if (error) return <Message emoji="📡" title="Can't connect" text={error} />;
  if (!nickname) return <Nickname />;
  if (changingName) {
    return (
      <Nickname onDone={() => setChangingName(false)} onCancel={() => setChangingName(false)} />
    );
  }

  return (
    <>
      <Navbar
        onChangeName={() => setChangingName(true)}
        onHome={() => setHomeKey((k) => k + 1)}
      />
      <div className="app-container">
        {/* Changing the key sends you back to the game shelf */}
        <Games key={homeKey} />
      </div>
    </>
  );
}

function Message({ emoji, title, text }) {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44 }}>{emoji}</div>
        <div className="auth-title">{title}</div>
        <div className="auth-subtitle">{text}</div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gameroom />
    </AuthProvider>
  );
}
