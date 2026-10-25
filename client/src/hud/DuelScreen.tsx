import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { DEFAULT_MATCH_CONFIG, opponentOf, type GameEvent, type MatchState, type PlayerSlot, type SpellId } from "@spellcaster/shared";
import { RisingEmbers } from "../arena/RisingEmbers";
import { ArenaScene, type ArenaFrame } from "../arena/ArenaScene";
import { loadMapChoice, type MapId } from "../arena/maps";
import { playEvents, setMusic, sfx } from "../audio/sound";
import { GestureCamera } from "../gesture/GestureCamera";
import { SpellStruggle } from "./SpellStruggle";
import { PoseRace } from "./PoseRace";
import type { DuelSource } from "../game/duelSource";
import { bindKeyboard, spellInput } from "../game/input";
import { rejectionText } from "../game/narration";
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

/** Re-renders every animation frame with the match clock's current time. */
function useMatchNow(source: DuelSource) {
  const [now, setNow] = useState(() => source.now());
  useEffect(() => {
    let frame = requestAnimationFrame(function loop() {
      setNow(source.now());
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  }, [source]);
  return now;
}

export function DuelScreen({ source, hotseat = false, rematchLabel = "Duel again", onLeave = () => {}, header, footer, map = loadMapChoice() }: DuelScreenProps) {
  const [state, setState] = useState<MatchState | null>(() => source.state());
  const [clashResult, setClashResult] = useState<ClashResult | null>(null);
  const [toast, setToast] = useState<Banner | null>(null);
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

  const left = source.localSlot;
  const right = opponentOf(left);
  const combatNow = state?.struggle?.kind === "pose" ? state.struggle.startedAt : now;

  useEffect(
    () =>
      source.subscribe((next, events) => {
        setState(next);
        scene.current?.pushEvents(events);
        playEvents(events, source.localSlot, hotseat);
        for (const event of events) {
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
    const arena = new ArenaScene(() => frame.current);
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

  const shakeClass = activeShake
    ? ` screen-shake-${activeShake.type}-${(activeShake.id % 2) + 1}`
    : state?.struggle?.kind === "pump"
    ? " screen-shake-clash"
    : "";

  return (
    <main className={`duel${shakeClass}`} style={{ "--top-inset": `${insets.top}px`, "--bottom-inset": `${insets.bottom}px` } as React.CSSProperties}>
      <div className={`duel-stage phase-${state?.phase ?? "waiting"}`}>
        <div className="duel-canvas" ref={host} />
        <RisingEmbers />
        {state?.struggle?.kind !== "pose" && <GestureCamera ultimateReady={!state || state.players[left].ultimate >= DEFAULT_MATCH_CONFIG.ultimateMax} struggling={!!state?.struggle} />}
        {state?.struggle?.kind === "pump" && <SpellStruggle state={state} now={now} leftSlot={left} hotseat={hotseat} />}
        {state?.struggle?.kind === "pose" && <PoseRace key={state.struggle.poseRace.id} struggle={state.struggle} source={source} now={now} hotseat={hotseat} />}
        {clashResult && !state?.struggle && (
          <section className={`clash-result ${clashResult.winner ? `player-${clashResult.winner}` : "draw"}`} role="status" key={clashResult.id}>
            <span>{clashResult.winner ? "✦ CLASH WINNER ✦" : "⚔ CLASH DRAW ⚔"}</span>
            <strong>{clashResult.winner
              ? hotseat ? `${playerName[clashResult.winner]} wins!` : clashResult.winner === left ? "You win the clash!" : "Rival wins the clash!"
              : clashResult.challenge === "pose" ? "Time's up!" : "Evenly matched!"}</strong>
            <p>{clashResult.winner ? "Winning spell absorbs both attacks and flies on." : clashResult.challenge === "pose" ? "Neither player finished all five poses. Both spells cancel out." : "Both spells cancel out. No winner."}</p>
          </section>
        )}
        {state && <CountdownOverlay state={state} now={now} />}
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
          <SpellTray player={state.players[left]} now={combatNow} onCast={state.struggle?.kind === "pose" ? undefined : castAs(left)} side="left" keySet="primary" />
          <SpellTray player={state.players[right]} now={combatNow} onCast={state.struggle?.kind === "pose" ? undefined : castAs(right)} side="right" keySet={hotseat ? "secondary" : null} />
        </section>
      )}
      {footer}
      {state && <VictoryOverlay state={state} localSlot={left} onRematch={() => source.rematch()} onLeave={onLeave} rematchLabel={rematchLabel} />}
    </main>
  );
}
