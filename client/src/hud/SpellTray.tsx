import { DEFAULT_MATCH_CONFIG, SPELL_ORDER, type PlayerState, type SpellId } from "@spellcaster/shared";
import { keyFor, type KeySet } from "../game/input";
import { art, spellGlyph } from "../theme";

interface SpellTrayProps {
  player: PlayerState;
  now: number;
  onCast?: (spell: SpellId) => void;
  side: "left" | "right";
  /** Which keyboard layout controls this wizard, if any. */
  keySet: KeySet | null;
}

/** Spell cards showing READY or the seconds left, the Fulmen meter and status effects for one wizard. */
export function SpellTray({ player, now, onCast, side, keySet }: SpellTrayProps) {
  const config = DEFAULT_MATCH_CONFIG;
  const frozen = now < player.frozenUntil;
  const meter = player.ultimate / config.ultimateMax;

  return (
    <div className={`tray ${side}`}>
      <div className="tray-spells">
        {SPELL_ORDER.map((spell) => {
          const spellConfig = config.spells[spell];
          const remaining = Math.max(0, player.readyAt[spell] - now);
          const fraction =
            spell === "ultimate" ? 1 - meter : remaining / (spellConfig.cooldownMs * (now < player.hasteUntil ? config.hasteCooldownFactor : 1));
          const locked = spellConfig.offensive && frozen;
          const ready = fraction <= 0 && !locked;
          return (
            <button
              key={spell}
              className={`spell spell-${spell} ${ready ? "ready" : ""} ${locked ? "locked" : ""}`}
              onClick={() => onCast?.(spell)}
              disabled={!onCast}
              title={`${spellConfig.name}${keySet ? ` (${keyFor(keySet, spell)})` : ""}`}
            >
              {art.spell[spell] ? (
                <img className="spell-glyph" src={art.spell[spell]} alt="" draggable={false} />
              ) : (
                <span className="spell-glyph">{spellGlyph[spell]}</span>
              )}
              <span className="spell-name">{spellConfig.name}</span>
              <span className="spell-state">
                {locked ? "FROZEN" : ready ? "READY" : spell === "ultimate" ? `${Math.floor(meter * 100)}%` : `${(remaining / 1000).toFixed(1)}s`}
              </span>
              <span className="spell-progress">
                <i style={{ width: `${(1 - Math.min(1, Math.max(0, fraction))) * 100}%` }} />
              </span>
              {keySet && <kbd>{keyFor(keySet, spell)}</kbd>}
            </button>
          );
        })}
      </div>
      <div className={`meter ${meter >= 1 ? "full" : ""}`}>
        <span>FULMEN</span>
        <div className="meter-track">
          <i style={{ width: `${meter * 100}%` }} />
        </div>
      </div>
      <StatusBadges player={player} now={now} />
    </div>
  );
}

function StatusBadges({ player, now }: { player: PlayerState; now: number }) {
  const badges = [
    now < player.shieldUntil && { id: "shield", text: "Shielded" },
    now < player.frozenUntil && { id: "frozen", text: `Frozen ${((player.frozenUntil - now) / 1000).toFixed(1)}s` },
  ].filter(Boolean) as { id: string; text: string }[];
  return (
    <div className="badges">
      {badges.map((badge) => (
        <span key={badge.id} className={`badge badge-${badge.id}`}>
          {badge.text}
        </span>
      ))}
    </div>
  );
}
