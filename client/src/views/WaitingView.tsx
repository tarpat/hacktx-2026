import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "../session";
import { StoryBackdrop } from "../StoryBackdrop";

export function WaitingView() {
  const navigate = useNavigate();
  const session = useSession();
  const [copied, setCopied] = useState(false);

  const room = session?.room;
  const rival = room?.players.B;

  // When rival joins the room, notify and proceed to calibration
  useEffect(() => {
    if (rival && rival.connected) {
      const timer = setTimeout(() => {
        navigate("/calibration");
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [rival, navigate]);

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  if (!room) {
    return (
      <main className="shell secondary-shell waiting-shell">
        <StoryBackdrop />
        <header className="topbar">
          <Link to="/" className="brand-link">
            <span className="brand-mark">✦</span> wizaaahhh!
          </Link>
        </header>
        <section className="calibration waiting-panel waiting-empty">
          <p className="eyebrow">NO DUEL IN PROGRESS</p>
          <h1>No room created</h1>
          <p className="intro">Head back to the lobby to create or join a duel.</p>
          <Link className="primary-button" to="/">
            Back to lobby <span>→</span>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="shell secondary-shell waiting-shell">
      <StoryBackdrop />
      <header className="topbar">
        <Link to="/" className="brand-link">
          <span className="brand-mark">✦</span> wizaaahhh!
        </Link>
        <span className="step-label">Room: <strong>{room.code}</strong></span>
      </header>

      <section className="calibration waiting-panel">
        <p className="eyebrow">THE ARENA IS READY</p>
        <h1>Waiting for the rival</h1>
        <p className="intro">
          Share this 5-letter room code with your rival so they can join your duel.
        </p>

        <div className="room-code-display">
          <span className="code-label">ROOM CODE</span>
          <div className="code-characters">
            {room.code.split("").map((char, index) => (
              <span key={index} className="code-box">
                {char}
              </span>
            ))}
          </div>
          <button className="secondary-button copy-button" onClick={copyCode}>
            {copied ? "Copied!" : "Copy room code"}
          </button>
        </div>

        <div className="waiting-status-card">
          <div className={`status-pulse-dot ${rival ? "online" : ""}`} />
          <div className="status-text">
            <strong>{rival ? "Rival connected!" : "Waiting for your rival to arrive…"}</strong>
            <span>
              {rival
                ? "Rival is here! Entering spellcraft calibration…"
                : "The duel begins as soon as both wizards take their place."}
            </span>
          </div>
        </div>

        <div className="waiting-actions">
          {rival ? (
            <button className="primary-button" onClick={() => navigate("/calibration")}>
              Proceed to calibration <span>→</span>
            </button>
          ) : (
            <button className="secondary-button" onClick={() => navigate("/calibration")}>
              Calibrate your camera while you wait
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
