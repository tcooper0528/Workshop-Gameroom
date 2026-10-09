import { useAuth } from "../context/AuthContext";

export default function Navbar({ onChangeName, onHome }) {
  const { nickname } = useAuth();

  return (
    <header className="navbar">
      <div className="navbar-top">
        <button
          onClick={onHome}
          style={{ background: "none", border: "none", color: "inherit", textAlign: "left", cursor: "pointer", padding: 0 }}
        >
          <div className="navbar-logo">🎮 Workshop Gameroom</div>
          <div className="navbar-tagline">Free games from Pop's Workshop</div>
        </button>
        {nickname && (
          <div className="navbar-user">
            <div className="navbar-avatar" title={nickname}>
              {nickname[0].toUpperCase()}
            </div>
            <button className="navbar-logout" onClick={onChangeName}>
              {nickname} · Change
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
