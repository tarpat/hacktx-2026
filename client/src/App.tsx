import { useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import type { CreateRoomResult, JoinRoomResult, SocketError } from "@spellcaster/shared";
import { Spellbook } from "./gesture/Spellbook";
import { MAX_NAME, loadMyName, saveMyName } from "./game/flair";
import { setSession, useSession } from "./session";
import { socket } from "./socket";
import { art } from "./theme";
import { StoryBackdrop } from "./StoryBackdrop";
import { ArenaView } from "./views/ArenaView";
import { CalibrationView } from "./views/CalibrationView";
import { GestureTestView } from "./views/GestureTestView";
import { PracticeView } from "./views/PracticeView";
import { WaitingView } from "./views/WaitingView";

function Lobby() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [myName, setMyName] = useState(loadMyName);
  const session = useSession();
  const room = session?.room ?? null;

  const createRoom = () => {
    socket.connect();
    socket.emit("CREATE_ROOM", (result: CreateRoomResult | SocketError) => {
      if ("error" in result) return setError(result.error);
      setError("");
      sessionStorage.setItem(`spellcaster:${result.room.code}`, result.sessionToken);
      setSession({ room: result.room, slot: result.playerSlot, sessionToken: result.sessionToken });
      navigate("/waiting");
    });
  };

  const joinRoom = () => {
    socket.connect();
    const normalizedCode = code.trim().toUpperCase();
    socket.emit("JOIN_ROOM", normalizedCode, sessionStorage.getItem(`spellcaster:${normalizedCode}`), (result: JoinRoomResult | SocketError) => {
      if ("error" in result) return setError(result.error);
      setError("");
      sessionStorage.setItem(`spellcaster:${result.room.code}`, result.sessionToken);
      setSession({ room: result.room, slot: result.playerSlot, sessionToken: result.sessionToken });
      navigate("/calibration");
    });
  };

  return <main className="shell lobby-shell">
    <StoryBackdrop />
    <header className="topbar"><span className="brand-mark">✦</span><span>wizaaahhh!</span><span className="topbar-note">A DUEL OF WITS & WIZARDRY</span></header>
    <section className="hero">
      <div className="hero-duelists" aria-hidden="true"><img className="hero-wizard a" src={art.portrait.A} alt="" /><span className="hero-vs">VS</span><img className="hero-wizard b" src={art.portrait.B} alt="" /></div>
      <p className="eyebrow">THE ARENA AWAITS</p><h1>wizaaahhh<span>!</span></h1>
      <p className="intro">Raise your hands. Choose your spell. Outwit a rival in a duel of magic.</p>
      <div className="lobby-card">
        <label className="name-field">
          <span>Your wizard name</span>
          <input
            placeholder="e.g. Judge Sarah"
            maxLength={MAX_NAME}
            value={myName}
            onChange={(event) => {
              setMyName(event.target.value);
              saveMyName(event.target.value);
            }}
          />
        </label>
        <button className="primary-button" onClick={createRoom}>Create a duel <span>→</span></button>
        <div className="divider"><span>OR JOIN A FRIEND</span></div>
        <div className="join-row"><input aria-label="Room code" placeholder="ENTER ROOM CODE" maxLength={5} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} /><button className="secondary-button" disabled={code.length < 5} onClick={joinRoom}>Join</button></div>
        {room && <div className="room-ready"><span>ROOM CODE</span><strong>{room.code}</strong><p>{room.players.A && room.players.B ? "Rival joined. Ready when you are." : "Share the code with your rival."}</p><button className="text-button" onClick={() => navigate(room.players.A && !room.players.B ? "/waiting" : "/calibration")}>Go to {room.players.A && !room.players.B ? "waiting room" : "calibration"} →</button></div>}
        {error && <p className="error-message">{error}</p>}
        <Link className="practice-link" to="/practice?mode=training">Practice against the training dummy</Link>
      </div>
      <div className="hero-foot">Two wizards · One arena</div>
      <p className="credits">Spell effects by <a href="https://v-ktor.itch.io/spell-animations">Viktor Hahn</a> (CC BY 4.0), <a href="https://tornadogames.itch.io/magic-sparksattacks-for-the-devs">TornadoGames</a> and <a href="https://kenney.nl/assets/particle-pack">Kenney</a>. Bull run cycle by <a href="https://opengameart.org/content/bull-run-cycle">reivaxcorp</a> and gallop sound by <a href="https://opengameart.org/node/132682">Alan McKinney</a> (CC BY 3.0).</p>
    </section>
    <section className="home-spellbook">
      <p className="eyebrow">YOUR SPELLBOOK</p>
      <h2>How to cast</h2>
      <Spellbook />
    </section>
  </main>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/waiting" element={<WaitingView />} />
      <Route path="/calibration" element={<CalibrationView />} />
      <Route path="/arena" element={<ArenaView />} />
      <Route path="/practice" element={<PracticeView />} />
      <Route path="/gesture-test" element={<GestureTestView />} />
    </Routes>
  );
}
