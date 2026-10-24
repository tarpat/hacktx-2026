import type { CastRejectReason, GameEvent, MatchState, PlayerSlot } from "@spellcaster/shared";
import { playerName } from "../theme";

const pick = (lines: string[], seed: number) => lines[seed % lines.length];

/** The comedic fairy-tale narrator. Returns a banner line for big moments, or null. */
export function narrate(event: GameEvent): string | null {
  switch (event.type) {
    case "PHASE_CHANGED":
      if (event.phase === "active") return pick(["Once upon a time... DUEL!", "Let the royal tournament begin!", "Wands at the ready. Begin!"], event.id);
      if (event.phase === "suddenDeath") return "Sudden death! The next spell writes the ending.";
      return null;
    case "SPELL_BLOCKED":
      return event.damage > 0
        ? `Fulmen shatters ${playerName[event.defender]}'s shield!`
        : pick([`${playerName[event.defender]} says: not today!`, "A royal block!", "Protego! The spell fizzles."], event.id);
    case "FROZEN":
      return pick([`${playerName[event.slot]} is frozen like a winter tale!`, "Brrr! Somebody fetch a blanket.", "Ice, ice, wizardy."], event.id);
    case "STRUGGLE_START":
      return "Spells lock together! PUMP to push it through!";
    case "SPELL_CLASH":
      return event.winner ? `Spells collide! ${playerName[event.winner]} pushes through!` : "Spells collide and vanish in a puff of glitter!";
    case "ULTIMATE_READY":
      return `${playerName[event.slot]} has Fulmen ready. Uh oh.`;
    case "POWER_UP":
      return {
        empower: `${playerName[event.slot]} is EMPOWERED!`,
        haste: `${playerName[event.slot]} moves with fairy haste!`,
        heal: `${playerName[event.slot]} sips a healing draught.`,
      }[event.powerUp];
    case "DAMAGE_APPLIED":
      return event.amount >= 30 ? pick(["That singed the beard!", "Critical hex!", "The crowd gasps!"], event.id) : null;
    default:
      return null;
  }
}

export const rejectionText: Record<CastRejectReason, string> = {
  not_active: "Wait for the duel to begin",
  cooldown: "Still recharging",
  frozen: "Frozen! Only Protego works",
  meter: "Fulmen needs a full meter",
  duplicate: "",
  unknown: "Unknown spell",
};

/** Fairy-tale title for the winner, based on how they played. */
export function winnerTitle(state: MatchState, winner: PlayerSlot): string {
  const me = state.players[winner];
  if (state.endReason === "knockout" && me.hp >= me.maxHp * 0.7) return "Flawless Archmage";
  if (me.stats.blocks >= 3) return "Grand Warden of the Realm";
  if (me.stats.clashesWon >= 1) return "Champion of the Clash";
  if (state.endReason === "suddenDeath") return "Hero of the Final Page";
  if (state.endReason === "time") return "Royal Court Sorcerer";
  return "Knight of the Wand";
}
