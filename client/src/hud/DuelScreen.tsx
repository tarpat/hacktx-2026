import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { castBlocker, DEFAULT_MATCH_CONFIG, opponentOf, type GameEvent, type MatchState, type PlayerSlot, type SpellId } from "@spellcaster/shared";
import { RisingEmbers } from "../arena/RisingEmbers";
import { ArenaScene, type ArenaFrame } from "../arena/ArenaScene";
import { MAP_ORDER, type MapId } from "../arena/maps";
import { playEvents, setMusic, sfx } from "../audio/sound";
import { GestureCamera } from "../gesture/GestureCamera";
import type { CircleChargeFeedback } from "../gesture/circleChargeCounter";
import { SpellStruggle } from "./SpellStruggle";
import { PoseRace } from "./PoseRace";
import type { DuelSource } from "../game/duelSource";
import { bindKeyboard, spellInput } from "../game/input";
import { rejectionText } from "../game/narration";
import { captureFace, getFlair, loadMyName, setFlair } from "../game/flair";
import { HypeTracker } from "../game/hype";
import { art, playerName } from "../theme";
import { HealthBar } from "./HealthBar";
import { CountdownOverlay, MatchClock } from "./MatchClock";
import { SpellTray } from "./SpellTray";
import { TraitRoll } from "./TraitRoll";
import { VictoryOverlay } from "./VictoryOverlay";

interface DuelScreenProps {
  source: DuelSource;
  /** Local two-player mode: the opponent is driven from the same keyboard. */
  hotseat?: boolean;
  rematchLabel?: string;
  onLeave?: () => void;
  header?: React.ReactNode;
  /** Local hotseat map. Other modes use the stage in the match snapshot. */
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

export function DuelScreen({ source, hotseat = false, rematchLabel = "Duel again", onLeave = () => {}, header, footer, map = MAP_ORDER[0] }: DuelScreenProps) {
  const [state, setState] = useState<MatchState | null>(() => source.state());
  const [clashResult, setClashResult] = useState<ClashResult | null>(null);
  const [circleChargeFeedback, setCircleChargeFeedback] = useState<CircleChargeFeedback>({ visible: false, progress: 0, hint: "Show one hand and draw a circle." });
  const [toast, setToast] = useState<Banner | null>(null);
  // Bumped whenever a new match starts its countdown, so each match reveals its traits once.
  const [matchSeq, setMatchSeq] = useState(0);
  const lastPhase = useRef(state?.phase);
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
  // The HUD's height changes as web fonts and frame art load; hold back inset-anchored panels until it settles.
  const [settled, setSettled] = useState(false);
  // Until the arena's art is on screen, show its painted backdrop instead of a bare stage.
  const [arenaReady, setArenaReady] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const ready = arenaReady && cameraReady;
  const frame = useRef<ArenaFrame>({ state, now, leftSlot: source.localSlot, map, insets });
  frame.current = { state, now, leftSlot: source.localSlot, map, insets };
  const clock = useRef(source);
  clock.current = source;

  const left = source.localSlot;
  const right = opponentOf(left);
  const combatNow = state?.struggle?.kind === "pose" ? state.struggle.startedAt : now;

  useEffect(
    () =>
      source.subscribe((next, events) => {
        setState(next);
        if (next.phase === "countdown" && lastPhase.current !== undefined && lastPhase.current !== "countdown") setMatchSeq((seq) => seq + 1);
        lastPhase.current = next.phase;
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

  // Your name goes to the rival (resent every few seconds in case they joined late).
  useEffect(() => {
    setFlair(source.localSlot, { name: loadMyName() });
    // Forget whoever sat in the other seat last time; the rival's own name arrives over the network.
    setFlair(opponentOf(source.localSlot), { name: "", face: "", ko: "" });
    shareName(source);
    const timer = window.setInterval(() => shareName(source), 3_000);
    return () => window.clearInterval(timer);
  }, [source]);

  useEffect(() => {
    if (!hype) return;
    const timeout = setTimeout(() => setHype(null), 2_300);
    return () => clearTimeout(timeout);
  }, [hype]);

  useEffect(() => {
    setMusic("battle");
    return () => setMusic("menu");
  }, []);

  useEffect(() => {
    const unbindKeys = bindKeyboard(source.localSlot, hotseat ? opponentOf(source.localSlot) : null);
    const unsubscribe = spellInput.subscribe((intent) => {
      if (intent.kind === "cast") {
        // Drop casts the engine would reject (cooldown, before the start, after the end) instead of sending them.
        const current = source.state();
        if (!current || castBlocker(current, intent.slot ?? source.localSlot, intent.spell, source.now())) return;
        source.cast(intent.spell, intent.slot, intent.power);
      }
      else if (intent.kind === "push") {
        sfx.push();
        if (source.state()?.struggle?.kind !== "pump") source.push(intent.slot);
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
    const arena = new ArenaScene(
      () => ({ ...frame.current, now: clock.current.now() }),
      () => setArenaReady(true),
    );
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

  // Practice: run the 3-2-1 only once the arena is drawn and the camera model has finished loading
  // (that load freezes the page, which used to swallow the countdown). Online matches follow the server.
  const begun = useRef(false);
  useEffect(() => {
    if (!ready || begun.current) return;
    begun.current = true;
    source.begin?.();
  }, [ready, source]);

  // Never hold the duel hostage to a camera that is slow to answer.
  useEffect(() => {
    const timeout = setTimeout(() => setCameraReady(true), 10_000);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    const measure = () => setInsets({ top: top.current?.offsetHeight ?? 0, bottom: bottom.current?.offsetHeight ?? 0 });
    measure();
    const observer = new ResizeObserver(measure);
    if (top.current) observer.observe(top.current);
    if (bottom.current) observer.observe(bottom.current);
    let cancelled = false;
    void Promise.all([document.fonts.ready, new Promise((resolve) => (document.readyState === "complete" ? resolve(null) : window.addEventListener("load", resolve, { once: true })))]).then(() =>
      requestAnimationFrame(() => {
        if (cancelled) return;
        measure();
        setSettled(state !== null);
      }),
    );
    return () => {
      cancelled = true;
      observer.disconnect();
    };
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

  // Keep the camera and tap targets stationary throughout the Magic charge challenge.
  const shakeClass = activeShake && state?.struggle?.kind !== "pump"
    ? ` screen-shake-${activeShake.type}-${(activeShake.id % 2) + 1}`
    : "";

  return (
    <main className={`duel${shakeClass}${settled ? " settled" : ""}`} data-arena={state?.stageId === undefined ? map : MAP_ORDER[state.stageId] ?? map} style={{ "--top-inset": `${insets.top}px`, "--bottom-inset": `${insets.bottom}px` } as React.CSSProperties}>
      <div className={`duel-stage phase-${state?.phase ?? "waiting"}`}>
        <div className="duel-canvas" ref={host} />
        {!ready && (
          <div className="arena-loading" style={{ backgroundImage: `url(${art.background})` }}>
            <span>Preparing the arena…</span>
          </div>
        )}
        <RisingEmbers />
        <div className={state?.struggle?.kind === "pump" ? "magic-charge-event" : "collision-inputs"}>
          {state?.struggle?.kind !== "pose" && <GestureCamera ultimateReady={!state || state.players[left].ultimate >= DEFAULT_MATCH_CONFIG.ultimateMax} struggling={!!state?.struggle} onCircleChargeFeedback={(feedback) => { setCircleChargeFeedback(feedback); if (feedback.trace && state?.struggle?.kind === "pump") source.circleTrace({ startedAt: state.struggle.startedAt, points: feedback.trace }); }} onReady={() => setCameraReady(true)} canCast={(spell) => !!state && !castBlocker(state, left, spell, source.now())} />}
          {state?.struggle?.kind === "pump" && <SpellStruggle state={state} now={now} leftSlot={left} hotseat={hotseat} feedback={circleChargeFeedback} />}
        </div>
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
        {state && ready && <CountdownOverlay state={state} now={source.now()} />}
        {/* Not tied to the countdown: online, the server's 3-2-1 often ends while this screen is still loading. */}
        {state && ready && state.phase !== "finished" && (
          <TraitRoll key={`${matchSeq}:${state.players.A.trait}:${state.players.B.trait}`} state={state} leftSlot={left} hotseat={hotseat} />
        )}
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
            <HealthBar slot={left} name={playerName[left]} hp={state.players[left].hp} maxHp={state.players[left].maxHp} side="left" isYou={!hotseat} trait={state.players[left].trait} />
            <MatchClock state={state} now={now} />
            <HealthBar slot={right} name={playerName[right]} hp={state.players[right].hp} maxHp={state.players[right].maxHp} side="right" isYou={false} trait={state.players[right].trait} />
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

/** Sends your display name to the rival (online only). */
function shareName(source: DuelSource) {
  source.shareFlair?.({ name: getFlair(source.localSlot).name ?? "" });
}
