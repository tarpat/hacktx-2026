import { useEffect, useState } from "react";
import type { GestureActionEvent } from "../gesture/types";

/**
 * Throwaway mock of how gesture actions could look in a duel.
 * The real visuals live in the Phaser arena; this only exercises the action events.
 */
export function SpellPreview({ lastAction }: { lastAction: (GestureActionEvent & { id: number }) | null }) {
  const [charging, setCharging] = useState(false);
  const [shield, setShield] = useState(false);
  const [fireballs, setFireballs] = useState<number[]>([]);
  const [rivalHp, setRivalHp] = useState(100);
  const [hitId, setHitId] = useState(0);

  useEffect(() => {
    if (!lastAction) return;
    switch (lastAction.action) {
      case "FIREBALL_CHARGE_START": setCharging(true); break;
      case "FIREBALL_CHARGE_CANCEL": setCharging(false); break;
      case "FIREBALL_CAST": {
        setCharging(false);
        const id = lastAction.id;
        setFireballs((f) => [...f, id]);
        // Matches the CSS flight duration.
        setTimeout(() => {
          setFireballs((f) => f.filter((x) => x !== id));
          setRivalHp((hp) => (hp - 20 <= 0 ? 100 : hp - 20));
          setHitId(id);
        }, 600);
        break;
      }
      case "SHIELD_START": setShield(true); break;
      case "SHIELD_END": setShield(false); break;
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
      {fireballs.map((id) => <span key={id} className="preview-fireball" />)}
      <div key={hitId} className={`preview-wizard rival${hitId ? " is-hit" : ""}`}>🧙‍♂️</div>
    </div>
  </div>;
}
