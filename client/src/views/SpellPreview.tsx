import { useEffect, useState } from "react";
import type { GestureActionEvent } from "../gesture/types";

type Projectile = "fire" | "ice" | "bolt";
const DAMAGE: Record<Projectile, number> = { fire: 20, ice: 10, bolt: 30 };

/**
 * Throwaway mock of how gesture actions could look in a duel.
 * The real visuals live in the Phaser arena; this only exercises the action events.
 */
export function SpellPreview({ lastAction }: { lastAction: (GestureActionEvent & { id: number }) | null }) {
  const [charging, setCharging] = useState(false);
  const [shield, setShield] = useState(false);
  const [projectiles, setProjectiles] = useState<{ id: number; kind: Projectile }[]>([]);
  const [rivalHp, setRivalHp] = useState(100);
  const [hitId, setHitId] = useState(0);

  const launch = (id: number, kind: Projectile) => {
    setProjectiles((p) => [...p, { id, kind }]);
    // Matches the CSS flight duration.
    setTimeout(() => {
      setProjectiles((p) => p.filter((x) => x.id !== id));
      setRivalHp((hp) => (hp - DAMAGE[kind] <= 0 ? 100 : hp - DAMAGE[kind]));
      setHitId(id);
    }, 600);
  };

  useEffect(() => {
    if (!lastAction) return;
    switch (lastAction.action) {
      case "FIREBALL_CHARGE_START": setCharging(true); break;
      case "FIREBALL_CHARGE_CANCEL": setCharging(false); break;
      case "FIREBALL_CAST": setCharging(false); launch(lastAction.id, "fire"); break;
      case "ICE_CAST": launch(lastAction.id, "ice"); break;
      case "ULTIMATE_CAST": launch(lastAction.id, "bolt"); break;
      case "SHIELD_CAST":
        setShield(true);
        // Mirrors the engine's 900 ms guard window.
        setTimeout(() => setShield(false), 900);
        break;
    }
  }, [lastAction]);

  return <div className="spell-preview">
    <div className="preview-hud">
      <span>YOU</span><i><b style={{ width: "100%" }} /></i>
      <i className="rival"><b style={{ width: `${rivalHp}%` }} /></i><span>RIVAL</span>
    </div>
    <div className="preview-stage">
      <div className="preview-wizard">
        🧙
        {charging && <span className="preview-charge" />}
        {shield && <span className="preview-shield" />}
      </div>
      {projectiles.map(({ id, kind }) => <span key={id} className={`preview-fireball ${kind}`} />)}
      <div key={hitId} className={`preview-wizard rival${hitId ? " is-hit" : ""}`}>🧙‍♂️</div>
    </div>
  </div>;
}
