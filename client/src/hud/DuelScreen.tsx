import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { DEFAULT_MATCH_CONFIG, opponentOf, type GameEvent, type MatchState, type PlayerSlot, type SpellId } from "@spellcaster/shared";
import { RisingEmbers } from "../arena/RisingEmbers";
import { ArenaScene, type ArenaFrame } from "../arena/ArenaScene";
import { loadMapChoice, type MapId } from "../arena/maps";
import { playEvents, setMusic, sfx } from "../audio/sound";
import { GestureCamera } from "../gesture/GestureCamera";
import { SpellStruggle } from "./SpellStruggle";
import type { DuelSource } from "../game/duelSource";
import { bindKeyboard, spellInput } from "../game/input";
import { rejectionText } from "../game/narration";
import { captureFace, getFlair, loadMyName, setFlair } from "../game/flair";
import { HypeTracker } from "../game/hype";
import { playerName } from "../theme";
import { HealthBar } from "./HealthBar";
import { CountdownOverlay, MatchClock } from "./MatchClock";
import { SpellTray } from "./SpellTray";
import { VictoryOverlay } from "./VictoryOverlay";

interface DuelScreenProps {
  source: DuelSource;
  /** Local two-player mode: the opponent is driven from the same keyboard. */
  hotseat?: boolean;
  rematchLabel?: string;
  onLeave?: () => void;
  header?: React.ReactNode;
  /** Arena map; defaults to the one picked in the lobby. */
  map?: MapId;
  /** Extra content under the spell trays, e.g. the practice spellbook. */
  footer?: React.ReactNode;
}

type ClashResult = Extract<GameEvent, { type: "SPELL_CLASH" }>;

interface Banner {
  id: number;
  text: string;
}

/** Match clock for HUD timers, re-rendered at ~10 Hz. The arena reads `source.now()` itself every frame. */
function useMatchNow(source: DuelSource) {
  const [now, setNow] = useState(() => source.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(source.now()), 100);
    return () => clearInterval(timer);
  }, [source]);
  return now;
}

export function DuelScreen({ source, hotseat = false, rematchLabel = "Duel again", onLeave = () => {}, header, footer, map = loadMapChoice() }: DuelScreenProps) {
  const [state, setState] = useState<MatchState | null>(() => source.state());
  const [clashResult, setClashResult] = useState<ClashResult | null>(null);
  const [toast, setToast] = useState<Banner | null>(null);
  const [hype, setHype] = useState<Banner | null>(null);
  const hypeTracker = useRef(new HypeTracker());
  const [activeShake, setActiveShake] = useState<{ type: "hit" | "clash-impact"; id: number } | null>(null);
  const shakeTimer = useRef<number | null>(null);

  const triggerShake = (type: "hit" | "clash-impact") => {
    if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    setActiveShake((prev) => ({ type, id: (prev?.id ?? 0) + 1 }));
    shakeTimer.current = window.setTimeout(() => {
      setActiveShake(null);
    }, type === "hit" ? 220 : 280);
  };

  useEffect(() => {
    return () => {
      if (shakeTimer.current) window.clearTimeout(shakeTimer.current);
    };
  }, []);

  const now = useMatchNow(source);
  const host = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLElement>(null);
  const scene = useRef<ArenaScene | null>(null);
  // The arena fills the screen; the HUD floats over it, so tell the scene what is covered.
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });
  const frame = useRef<ArenaFrame>({ state, now, leftSlot: source.localSlot, map, insets });
  frame.current = { state, now, leftSlot: source.localSlot, map, insets };
  const clock = useRef(source);
  clock.current = source;

  const left = source.localSlot;
  const right = opponentOf(left);

  useEffect(
    () =>
      source.subscribe((next, events) => {
        setState(next);
        scene.current?.pushEvents(events);
        playEvents(events, source.localSlot, hotseat);
        const callouts = hypeTracker.current.read(events);
        for (const callout of callouts) if (callout.sound) sfx.meme(callout.sound);
        if (callouts.length) setHype({ id: events[events.length - 1].id, text: callouts[callouts.length - 1].text });
        for (const event of events) {
          if (event.type === "PHASE_CHANGED" && event.phase === "countdown") {
            setFlair("A", { ko: "" });
            setFlair("B", { ko: "" });
          }
          // A fresh webcam face the instant you're hit, so the reaction shows on your wizard.
          if (event.type === "DAMAGE_APPLIED" && event.target === source.localSlot) shareFace(source);
          // Freeze the loser's real face at the knockout for the victory card. In hotseat
          // both players share one camera, so it catches whoever lost.
          if (event.type === "MATCH_END" && event.winner) {
            const loser = opponentOf(event.winner);
            if (hotseat || loser === source.localSlot) {
              const ko = captureFace(160);
              if (ko) {
                setFlair(loser, { ko });
                source.shareFlair?.({ ko });
              }
            }
          }
          if (event.type === "DAMAGE_APPLIED") triggerShake("hit");
          if (event.type === "SPELL_CLASH") {
            setClashResult(event);
            triggerShake("clash-impact");
          }
          if (event.type === "STRUGGLE_START") {
            setClashResult(null);
            triggerShake("hit");
          }
          if (event.type === "PHASE_CHANGED" && event.phase === "countdown") setClashResult(null);
          if (event.type === "CAST_REJECTED" && (hotseat || event.slot === source.localSlot) && rejectionText[event.reason]) {
            setToast({ id: event.id, text: rejectionText[event.reason] });
          }
        }
      }),
    [source, hotseat],
  );

  // Your name, and your live face on your wizard's head (refreshed every 1.5s), go to the rival.
  useEffect(() => {
    setFlair(source.localSlot, { name: loadMyName() });
    // Forget whoever sat in the other seat last time; the rival's own name arrives over the network.
    setFlair(opponentOf(source.localSlot), { name: "", face: "", ko: "" });
    shareFace(source);
    const timer = window.setInterval(() => shareFace(source), 1_500);
    return () => window.clearInterval(timer);
  }, [source]);

  useEffect(() => {
    if (!hype) return;
    const timeout = setTimeout(() => setHype(null), 1_800);
    return () => clearTimeout(timeout);
  }, [hype]);

  useEffect(() => {
    setMusic("battle");
    return () => setMusic("menu");
  }, []);

  useEffect(() => {
    const unbindKeys = bindKeyboard(source.localSlot, hotseat ? opponentOf(source.localSlot) : null);
    const unsubscribe = spellInput.subscribe((intent) => {
      if (intent.kind === "cast") source.cast(intent.spell, intent.slot, intent.power);
      else if (intent.kind === "push") {
        sfx.push();
        source.push(intent.slot);
      }
      else if (intent.kind === "powerUp") source.powerUp(intent.powerUp, intent.slot);
    });
    return () => {
      unbindKeys();
      unsubscribe();
    };
  }, [source, hotseat]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const arena = new ArenaScene(() => ({ ...frame.current, now: clock.current.now() }));
    scene.current = arena;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: element,
      transparent: true,
      width: element.clientWidth || 960,
      height: element.clientHeight || 540,
      scene: arena,
    });
    // Size the canvas from the stage ourselves: Phaser's RESIZE mode misses element-only reflows.
    const observer = new ResizeObserver(() => {
      if (element.clientWidth && element.clientHeight) game.scale.resize(element.clientWidth, element.clientHeight);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      scene.current = null;
      game.destroy(true);
    };
  }, []);

  useEffect(() => {
    const measure = () => setInsets({ top: top.current?.offsetHeight ?? 0, bottom: bottom.current?.offsetHeight ?? 0 });
    measure();
    const observer = new ResizeObserver(measure);
    if (top.current) observer.observe(top.current);
    if (bottom.current) observer.observe(bottom.current);
    return () => observer.disconnect();
  }, [state !== null]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 1_200);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!clashResult) return;
    const timeout = setTimeout(() => setClashResult(null), 3_000);
    return () => clearTimeout(timeout);
  }, [clashResult]);

  // Tick on each countdown number.
  const countdownSecond = state?.phase === "countdown" ? Math.ceil((state.phaseEndsAt - now) / 1000) : 0;
  useEffect(() => {
    if (countdownSecond > 0) sfx.countdownTick();
  }, [countdownSecond]);

  const struggle = state?.struggle;
  const currentPushes = struggle ? struggle.pushes.A + struggle.pushes.B : 0;
  const lastPushes = useRef<number>(0);

  useEffect(() => {
    if (!struggle) {
      lastPushes.current = 0;
      return;
    }
    if (currentPushes > lastPushes.current) {
      lastPushes.current = currentPushes;
      triggerShake("hit");
    }
  }, [struggle, currentPushes]);

  const castAs = (slot: PlayerSlot) => (slot === left || hotseat ? (spell: SpellId) => spellInput.cast(spell, slot) : undefined);

  const isStruggling = Boolean(state?.struggle);
  const shakeClass = activeShake
    ? ` screen-shake-${activeShake.type}-${(activeShake.id % 2) + 1}`
    : isStruggling
    ? " screen-shake-clash"
    : "";

  return (
    <main className={`duel${shakeClass}`} style={{ "--top-inset": `${insets.top}px`, "--bottom-inset": `${insets.bottom}px` } as React.CSSProperties}>
      <div className={`duel-stage phase-${state?.phase ?? "waiting"}`}>
        <div className="duel-canvas" ref={host} />
        <RisingEmbers />
        <GestureCamera ultimateReady={!state || state.players[left].ultimate >= DEFAULT_MATCH_CONFIG.ultimateMax} struggling={!!state?.struggle} />
        {state?.struggle && <SpellStruggle state={state} now={now} leftSlot={left} hotseat={hotseat} />}
        {clashResult && !state?.struggle && (
          <section className={`clash-result ${clashResult.winner ? `player-${clashResult.winner}` : "draw"}`} role="status" key={clashResult.id}>
            <span>{clashResult.winner ? "✦ CLASH WINNER ✦" : "⚔ CLASH DRAW ⚔"}</span>
            <strong>{clashResult.winner
              ? hotseat ? `${playerName[clashResult.winner]} wins!` : clashResult.winner === left ? "You win the clash!" : "Rival wins the clash!"
              : "Evenly matched!"}</strong>
            <p>{clashResult.winner ? "Winning spell absorbs both attacks and flies on." : "Both spells cancel out. No winner."}</p>
          </section>
        )}
        {state && <CountdownOverlay state={state} now={now} />}
        {hype && (
          <div className="hype" key={hype.id}>
            {hype.text}
          </div>
        )}
        {toast && (
          <div className="toast" key={toast.id}>
            {toast.text}
          </div>
        )}
      </div>

      <div className="duel-top" ref={top}>
        <header className="duel-header">
          <span className="brand-mark">✦</span>
          <span className="duel-brand">SPELLCASTER</span>
          {header}
        </header>
        {state && (
          <section className="duel-hud">
            <HealthBar slot={left} name={playerName[left]} hp={state.players[left].hp} maxHp={state.players[left].maxHp} side="left" isYou={!hotseat} />
            <MatchClock state={state} now={now} />
            <HealthBar slot={right} name={playerName[right]} hp={state.players[right].hp} maxHp={state.players[right].maxHp} side="right" isYou={false} />
          </section>
        )}
      </div>

      {state && (
        <section className="duel-trays" ref={bottom}>
          <SpellTray player={state.players[left]} now={now} onCast={castAs(left)} side="left" keySet="primary" />
          <SpellTray player={state.players[right]} now={now} onCast={castAs(right)} side="right" keySet={hotseat ? "secondary" : null} />
        </section>
      )}
      {footer}
      {state && <VictoryOverlay state={state} localSlot={left} onRematch={() => source.rematch()} onLeave={onLeave} rematchLabel={rematchLabel} />}
    </main>
  );
}

/** Captures your current webcam face (if the camera is on) and sends it with your name. */
function shareFace(source: DuelSource) {
  const face = captureFace();
  if (face) setFlair(source.localSlot, { face });
  source.shareFlair?.({ name: getFlair(source.localSlot).name ?? "", ...(face ? { face } : {}) });
}
