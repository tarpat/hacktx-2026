import { useEffect, useRef } from "react";
import { useState } from "react";
import Phaser from "phaser";
import type { MatchState, PlayerSlot, SpellId } from "@spellcaster/shared";
import { currentMatchState, socket } from "../socket";
import { castSpell, setShieldHeld } from "../gameActions";

class ArenaScene extends Phaser.Scene {
  constructor() { super("arena"); }
  create() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height * 0.78, width, height * 0.44, 0x28213a).setDepth(0);
    this.add.ellipse(width * 0.25, height * 0.67, 150, 210, 0x7955a8).setDepth(1);
    this.add.ellipse(width * 0.75, height * 0.67, 150, 210, 0x4d83a7).setDepth(1);
    this.add.triangle(width * 0.25, height * 0.48, -54, 54, 54, 54, 0, -85, 0xe9d4a5).setDepth(2).setScale(1, 1);
    this.add.triangle(width * 0.75, height * 0.48, -54, 54, 54, 54, 0, -85, 0xe9d4a5).setDepth(2).setScale(-1, 1);
    this.add.text(width * 0.5, height * 0.28, "VS", { fontFamily: "monospace", fontSize: "22px", color: "#e8cf8c" }).setOrigin(0.5).setAlpha(0.75);
    this.add.circle(width * 0.5, height * 0.55, 9, 0xf4d36f).setDepth(3);
    this.game.events.on("spell", (event: { slot: PlayerSlot; spell: SpellId }) => {
      const fromX = event.slot === "A" ? width * 0.3 : width * 0.7;
      const toX = event.slot === "A" ? width * 0.7 : width * 0.3;
      const color = event.spell === "glacius" ? 0x8bdcf4 : event.spell === "protego" ? 0xf4d36f : 0xff865c;
      const orb = this.add.circle(fromX, height * 0.62, 14, color).setDepth(4);
      this.tweens.add({ targets: orb, x: toX, duration: event.spell === "glacius" ? 500 : 850, onComplete: () => orb.destroy() });
    });
  }
}

export function ArenaView() {
  const host = useRef<HTMLDivElement>(null);
  const [match, setMatch] = useState<MatchState | null>(currentMatchState);
  const [remaining, setRemaining] = useState(60);
  const [clockNow, setClockNow] = useState(Date.now());
  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current, backgroundColor: "#171326", scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" }, scene: ArenaScene });
    const onSpell = (event: { slot: PlayerSlot; spell: SpellId }) => game.events.emit("spell", event);
    const onState = (state: MatchState) => setMatch(state);
    const onEnd = (event: { winner: PlayerSlot | "draw" }) => setMatch((previous) => previous ? { ...previous, phase: "finished", winner: event.winner, endsAt: null } : previous);
    socket.on("SPELL_ACCEPTED", onSpell);
    socket.on("MATCH_STATE", onState);
    socket.on("MATCH_START", onState);
    socket.on("MATCH_END", onEnd);
    return () => { socket.off("SPELL_ACCEPTED", onSpell); socket.off("MATCH_STATE", onState); socket.off("MATCH_START", onState); socket.off("MATCH_END", onEnd); game.destroy(true); };
  }, []);
  useEffect(() => {
    const tick = () => { setClockNow(Date.now()); if (match?.endsAt) setRemaining(Math.max(0, Math.ceil((match.endsAt - Date.now()) / 1000))); };
    tick(); const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [match?.endsAt]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement) return;
      if (event.key === "1") castSpell("incendio");
      if (event.key === "2") castSpell("glacius");
      if (event.key === "3") setShieldHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === "3") setShieldHeld(false); };
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  }, []);
  useEffect(() => {
    const onDamage = (event: { hp: Record<PlayerSlot, number> }) => setMatch((previous) => previous ? { ...previous, hp: event.hp } : previous);
    socket.on("DAMAGE_APPLIED", onDamage);
    return () => { socket.off("DAMAGE_APPLIED", onDamage); };
  }, []);
  const hpA = match?.hp.A ?? 100; const hpB = match?.hp.B ?? 100;
  const label = match?.phase === "countdown" ? `STARTING ${Math.max(1, Math.ceil(((match.countdownEndsAt ?? clockNow) - clockNow) / 1000))}` : match?.phase === "finished" ? match.winner === "draw" ? "DRAW" : `PLAYER ${match.winner} WINS` : match?.phase === "active" ? "LIVE DUEL" : "WAITING FOR WIZARDS";
  return <main className="arena-shell"><header className="arena-header"><span className="brand-mark">✦</span> SPELLCASTER <span className="arena-status">FIXED DUEL · {label}</span></header><section className="hud"><div className="fighter"><span>PLAYER A</span><div className="hp-track"><i style={{ width: `${hpA}%` }} /></div><b>{hpA}</b></div><div className="timer">{String(Math.floor(remaining / 60)).padStart(2,"0")}:{String(remaining % 60).padStart(2,"0")}</div><div className="fighter opponent"><span>PLAYER B</span><div className="hp-track"><i style={{ width: `${hpB}%` }} /></div><b>{hpB}</b></div></section><div className="arena-canvas" ref={host} /><div className="arena-caption"><span>✧</span> PLAYER A  ← DUEL LINE →  PLAYER B <span>✧</span></div><nav className="fallback-controls" aria-label="Keyboard fallback controls"><button onClick={() => castSpell("incendio")}>1 · FIREBALL</button><button onClick={() => castSpell("glacius")}>2 · ICE</button><button onPointerDown={() => setShieldHeld(true)} onPointerUp={() => setShieldHeld(false)} onPointerLeave={() => setShieldHeld(false)}>HOLD 3 · SHIELD</button></nav></main>;
}
