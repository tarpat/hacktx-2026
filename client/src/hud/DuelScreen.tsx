import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { DEFAULT_MATCH_CONFIG, opponentOf, type MatchState, type PlayerSlot, type PowerUpId, type SpellId } from "@spellcaster/shared";
import { ArenaScene, type ArenaFrame } from "../arena/ArenaScene";
import { GestureCamera } from "../gesture/GestureCamera";
import type { DuelSource } from "../game/duelSource";
import { bindKeyboard, spellInput } from "../game/input";
import { narrate, rejectionText } from "../game/narration";
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
  /** Extra content under the spell trays, e.g. the practice spellbook. */
  footer?: React.ReactNode;
}

const POWER_UPS: { id: PowerUpId; label: string; key: string }[] = [
  { id: "empower", label: "✨ Empower", key: "1" },
  { id: "haste", label: "🪽 Haste", key: "2" },
  { id: "heal", label: "🧪 Heal", key: "3" },
];

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

export function DuelScreen({ source, hotseat = false, rematchLabel = "Duel again", onLeave = () => {}, header, footer }: DuelScreenProps) {
  const [state, setState] = useState<MatchState | null>(() => source.state());
  const [banner, setBanner] = useState<Banner | null>(null);
  const [toast, setToast] = useState<Banner | null>(null);
  const now = useMatchNow(source);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ArenaScene | null>(null);
  const frame = useRef<ArenaFrame>({ state, now, leftSlot: source.localSlot });
  frame.current = { state, now, leftSlot: source.localSlot };

  const left = source.localSlot;
  const right = opponentOf(left);

  useEffect(
    () =>
      source.subscribe((next, events) => {
        setState(next);
        scene.current?.pushEvents(events);
        for (const event of events) {
          const line = narrate(event);
          if (line) setBanner({ id: event.id, text: line });
          if (event.type === "CAST_REJECTED" && (hotseat || event.slot === source.localSlot) && rejectionText[event.reason]) {
            setToast({ id: event.id, text: rejectionText[event.reason] });
          }
        }
      }),
    [source, hotseat],
  );

  useEffect(() => {
    const unbindKeys = bindKeyboard(source.localSlot, hotseat ? opponentOf(source.localSlot) : null);
    const unsubscribe = spellInput.subscribe((intent) => {
      if (intent.kind === "cast") source.cast(intent.spell, intent.slot, intent.power);
      else source.powerUp(intent.powerUp, intent.slot);
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
    if (!banner) return;
    const timeout = setTimeout(() => setBanner(null), 2_200);
    return () => clearTimeout(timeout);
  }, [banner]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 1_200);
    return () => clearTimeout(timeout);
  }, [toast]);

  const castAs = (slot: PlayerSlot) => (slot === left || hotseat ? (spell: SpellId) => spellInput.cast(spell, slot) : undefined);
  const grant = (powerUp: PowerUpId) => spellInput.powerUp(powerUp, left);

  const powerUpWait = state ? Math.max(0, state.players[left].powerUpReadyAt - now) : 0;
  const live = state?.phase === "active" || state?.phase === "suddenDeath";

  return (
    <main className="duel">
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

      <div className={`duel-stage ${state?.phase ?? "waiting"}`}>
        <div className="duel-canvas" ref={host} />
        <GestureCamera ultimateReady={!state || state.players[left].ultimate >= DEFAULT_MATCH_CONFIG.ultimateMax} />
        {state && <CountdownOverlay state={state} now={now} />}
        {banner && state?.phase !== "finished" && (
          <div className="banner" key={banner.id}>
            {banner.text}
          </div>
        )}
        {toast && (
          <div className="toast" key={toast.id}>
            {toast.text}
          </div>
        )}
        {state && <VictoryOverlay state={state} localSlot={left} onRematch={() => source.rematch()} onLeave={onLeave} rematchLabel={rematchLabel} />}
      </div>

      {state && (
        <section className="duel-trays">
          <SpellTray player={state.players[left]} now={now} onCast={castAs(left)} side="left" keySet="primary" />
          <div className={`powerups ${live && powerUpWait === 0 ? "ready" : ""}`}>
            <span>Incantation power-ups {powerUpWait > 0 && `· ${Math.ceil(powerUpWait / 1000)}s`}</span>
            <div>
              {POWER_UPS.map(({ id, label, key }) => (
                <button key={id} onClick={() => grant(id)} disabled={!live || powerUpWait > 0}>
                  {label} <kbd>{key}</kbd>
                </button>
              ))}
            </div>
          </div>
          <SpellTray player={state.players[right]} now={now} onCast={castAs(right)} side="right" keySet={hotseat ? "secondary" : null} />
        </section>
      )}
      {footer}
    </main>
  );
}
