import { useEffect, useRef, useState } from "react";
import type { PlayerSlot } from "@spellcaster/shared";

interface HealthBarProps {
  slot: PlayerSlot;
  name: string;
  hp: number;
  maxHp: number;
  side: "left" | "right";
  isYou: boolean;
}

/** HP bar with a lagging "ghost" segment that shows the chunk just lost. */
export function HealthBar({ slot, name, hp, maxHp, side, isYou }: HealthBarProps) {
  const [ghost, setGhost] = useState(hp);
  const [hitKey, setHitKey] = useState(0);
  const previous = useRef(hp);

  useEffect(() => {
    if (hp < previous.current) setHitKey((key) => key + 1);
    previous.current = hp;
    if (hp >= ghost) return setGhost(hp);
    const timeout = setTimeout(() => setGhost(hp), 450);
    return () => clearTimeout(timeout);
  }, [hp, ghost]);

  const percent = (hp / maxHp) * 100;
  const level = percent > 60 ? "healthy" : percent > 25 ? "wounded" : "critical";

  return (
    <div className={`health ${side} player-${slot} ${level}`}>
      <div className="health-label">
        <span className="health-name">
          {name}
          {isYou && <em>you</em>}
        </span>
        <b className="health-value">{Math.ceil(hp)}</b>
      </div>
      <div className="health-track" key={hitKey}>
        <i className="health-ghost" style={{ width: `${(ghost / maxHp) * 100}%` }} />
        <i className="health-fill" style={{ width: `${percent}%` }} />
        <span className="health-notches" />
      </div>
    </div>
  );
}
