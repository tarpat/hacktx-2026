import { useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import type { CreateRoomResult, JoinRoomResult, SocketError } from "@spellcaster/shared";
import { setSession, useSession } from "./session";
import { socket } from "./socket";
import { ArenaView } from "./views/ArenaView";
import { AudioPlayground } from "./audio/AudioPlayground";
import { PracticeView } from "./views/PracticeView";

function Lobby() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const room = useSession()?.room ?? null;
  const [error, setError] = useState("");

  const handleResult = (result: CreateRoomResult | JoinRoomResult | SocketError) => {
    if ("error" in result) return setError(result.error);
    setError("");
    sessionStorage.setItem(`spellcaster:${result.room.code}`, result.sessionToken);
    setSession({ room: result.room, slot: result.playerSlot, sessionToken: result.sessionToken });
  };

  const createRoom = () => {
    socket.connect();
    socket.emit("CREATE_ROOM", handleResult);
  };

  const joinRoom = () => {
    socket.connect();
    const normalizedCode = code.trim().toUpperCase();
    socket.emit("JOIN_ROOM", normalizedCode, sessionStorage.getItem(`spellcaster:${normalizedCode}`), handleResult);
  };

  const continueToCalibration = () => {
    if (room) navigate("/calibration");
  };

  return <main className="shell lobby-shell">
    <header className="topbar"><span className="brand-mark">✦</span><span>SPELLCASTER</span><span className="topbar-note">A DUEL OF WITS & WIZARDRY</span></header>
    <section className="hero">
      <p className="eyebrow">THE ARENA AWAITS</p><h1>SpellCaster<span>:</span><br />Wizard Duel</h1>
      <p className="intro">Raise your hands. Choose your spell. Outwit a rival in a duel of magic.</p>
      <div className="lobby-card">
        <button className="primary-button" onClick={createRoom}>Create a duel <span>↗</span></button>
        <div className="divider"><span>OR JOIN A FRIEND</span></div>
        <div className="join-row"><input aria-label="Room code" placeholder="ENTER ROOM CODE" maxLength={5} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /><button className="secondary-button" disabled={code.length < 5} onClick={joinRoom}>Join</button></div>
        {room && <div className="room-ready"><span>ROOM CODE</span><strong>{room.code}</strong><p>{room.players.A && room.players.B ? "Rival joined. Ready when you are." : "Share the code with your rival."}</p><button className="text-button" onClick={continueToCalibration}>Continue to calibration →</button></div>}
        {error && <p className="error-message">{error}</p>}
        <Link className="practice-link" to="/practice">✧ Practice against the training dummy</Link>
      </div>
      <div className="hero-foot"><span>✧</span> TWO WIZARDS. ONE ARENA. <span>✧</span></div>
    </section>
  </main>;
}

function Calibration() {
  const navigate = useNavigate();
  return <main className="shell secondary-shell"><header className="topbar"><Link to="/" className="brand-link"><span className="brand-mark">✦</span> SPELLCASTER</Link><span className="step-label">01 / CALIBRATION</span></header>
    <section className="calibration"><p className="eyebrow">BEFORE YOU ENTER</p><h1>Set your spellcraft</h1><p className="intro">Make sure your wand hand is visible. Camera gestures will be calibrated in the next phase.</p>
      <div className="camera-frame"><div className="camera-corners" /><div className="camera-placeholder"><span className="camera-icon">◉</span><strong>CAMERA PREVIEW</strong><span>Camera setup arrives in Phase 1</span></div></div>
      <div className="gesture-row">{["FIST", "OPEN PALM", "TWO FINGERS"].map((gesture, index) => <div className="gesture-card" key={gesture}><span>0{index + 1}</span><strong>{gesture}</strong><i>{index === 0 ? "✊" : index === 1 ? "✋" : "✌"}</i></div>)}</div>
      <button className="primary-button" onClick={() => navigate("/arena")}>Enter the arena <span>↗</span></button>
    </section>
  </main>;
}

export default function App() {
  return <Routes><Route path="/" element={<Lobby />} /><Route path="/calibration" element={<Calibration />} /><Route path="/arena" element={<ArenaView />} /><Route path="/practice" element={<PracticeView />} /><Route path="/audio-test" element={<AudioPlayground />} /></Routes>;
}
