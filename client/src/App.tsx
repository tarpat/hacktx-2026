import { useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import type { CreateRoomResult, JoinRoomResult, SocketError } from "@spellcaster/shared";
import { MapPicker, useMapChoice } from "./arena/MapPicker";
import { MAP_ORDER, type MapId } from "./arena/maps";
import { Spellbook } from "./gesture/Spellbook";
import { setSession, useSession } from "./session";
import { socket } from "./socket";
import { art } from "./theme";
import { ArenaView } from "./views/ArenaView";
import { GestureTestView } from "./views/GestureTestView";
import { PracticeView } from "./views/PracticeView";

/** Drifting motes over the home backdrop; positions are fixed so renders don't reshuffle them. */
const MOTES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i * 0.7) % 9}s`,
  duration: `${9 + (i % 5) * 2}s`,
  size: `${2 + (i % 3)}px`,
}));

function HomeBackdrop() {
  return <div className="home-backdrop" aria-hidden="true" style={{ backgroundImage: `url(${art.background})` }}>
    {MOTES.map((m, i) => <i key={i} style={{ left: m.left, animationDelay: m.delay, animationDuration: m.duration, width: m.size, height: m.size }} />)}
  </div>;
}

function Lobby() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [map, setMap] = useMapChoice();
  const session = useSession();
  const room = session?.room ?? null;

  // The room creator's pick decides the map both players see.
  const chooseMap = (id: MapId) => {
    setMap(id);
    if (session?.slot === "A") socket.emit("STAGE_PREFERENCE", MAP_ORDER.indexOf(id));
  };

  const handleResult = (result: CreateRoomResult | JoinRoomResult | SocketError) => {
    if ("error" in result) return setError(result.error);
    setError("");
    sessionStorage.setItem(`spellcaster:${result.room.code}`, result.sessionToken);
    setSession({ room: result.room, slot: result.playerSlot, sessionToken: result.sessionToken });
    if (result.playerSlot === "A") socket.emit("STAGE_PREFERENCE", MAP_ORDER.indexOf(map));
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
    <HomeBackdrop />
    <header className="topbar"><span className="brand-mark">✦</span><span>SPELLCASTER</span><span className="topbar-note">A DUEL OF WITS & WIZARDRY</span></header>
    <section className="hero">
      <div className="hero-duelists" aria-hidden="true"><img className="hero-wizard a" src={art.portrait.A} alt="" /><span className="hero-vs">VS</span><img className="hero-wizard b" src={art.portrait.B} alt="" /></div>
      <p className="eyebrow">THE ARENA AWAITS</p><h1>SpellCaster<span>:</span><br />Wizard Duel</h1>
      <p className="intro">Raise your hands. Choose your spell. Outwit a rival in a duel of magic.</p>
      <div className="lobby-card">
        <MapPicker value={map} onChange={chooseMap} />
        <button className="primary-button" onClick={createRoom}>Create a duel <span>↗</span></button>
        <div className="divider"><span>OR JOIN A FRIEND</span></div>
        <div className="join-row"><input aria-label="Room code" placeholder="ENTER ROOM CODE" maxLength={5} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /><button className="secondary-button" disabled={code.length < 5} onClick={joinRoom}>Join</button></div>
        {room && <div className="room-ready"><span>ROOM CODE</span><strong>{room.code}</strong><p>{room.players.A && room.players.B ? "Rival joined. Ready when you are." : "Share the code with your rival."}</p><button className="text-button" onClick={continueToCalibration}>Continue to calibration →</button></div>}
        {error && <p className="error-message">{error}</p>}
        <Link className="practice-link" to="/practice?mode=training">✧ Practice against the training dummy</Link>
      </div>
      <div className="hero-foot"><span>✧</span> TWO WIZARDS. ONE ARENA. <span>✧</span></div>
      <p className="credits">Spell effects by <a href="https://v-ktor.itch.io/spell-animations">Viktor Hahn</a> (CC BY 4.0), <a href="https://tornadogames.itch.io/magic-sparksattacks-for-the-devs">TornadoGames</a> and <a href="https://kenney.nl/assets/particle-pack">Kenney</a>.</p>
    </section>
    <section className="home-spellbook">
      <p className="eyebrow">YOUR SPELLBOOK</p>
      <h2>How to cast</h2>
      <Spellbook />
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
  return <Routes><Route path="/" element={<Lobby />} /><Route path="/calibration" element={<Calibration />} /><Route path="/arena" element={<ArenaView />} /><Route path="/practice" element={<PracticeView />} /><Route path="/gesture-test" element={<GestureTestView />} /></Routes>;
}
