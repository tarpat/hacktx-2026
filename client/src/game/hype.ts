import { opponentOf, type GameEvent, type PlayerSlot } from "@spellcaster/shared";
import { playerName } from "../theme";

/** A shout-out for the crowd, and the meme sound that goes with it. */
export interface Hype {
  text: string;
  sound?: "bruh" | "emotionalDamage" | "sadTrombone";
}

/**
 * Watches a match for streaks and blunders: hits in a row, hits taken without ever raising
 * Protego, huge hits, blocks and the knockout. Reset it when a new match starts.
 */
export class HypeTracker {
  private streak: Record<PlayerSlot, number> = { A: 0, B: 0 };
  private unshielded: Record<PlayerSlot, number> = { A: 0, B: 0 };

  reset() {
    this.streak = { A: 0, B: 0 };
    this.unshielded = { A: 0, B: 0 };
  }

  /** Returns the callouts a batch of events earns, most important last. */
  read(events: GameEvent[]): Hype[] {
    const out: Hype[] = [];
    for (const event of events) {
      if (event.type === "PHASE_CHANGED" && event.phase === "countdown") this.reset();
      if (event.type === "SPELL_CAST" && event.spell === "shield") this.unshielded[event.slot] = 0;
      if (event.type === "SPELL_BLOCKED") {
        out.push({ text: pickLine(event.id, ["Blocked. Bruh.", "Not even close.", "Denied!"]), sound: "bruh" });
      }
      if (event.type === "DAMAGE_APPLIED") {
        const attacker = opponentOf(event.target);
        this.streak[attacker] += 1;
        this.streak[event.target] = 0;
        this.unshielded[event.target] += 1;
        const streak = this.streak[attacker];
        if (event.amount >= 30) out.push({ text: "EMOTIONAL DAMAGE!", sound: "emotionalDamage" });
        if (streak === 2) out.push({ text: "DOUBLE KILL!" });
        if (streak >= 3) out.push({ text: `UNSTOPPABLE! ${playerName[attacker]} x${streak}` });
        if (this.unshielded[event.target] === 3) out.push({ text: `${playerName[event.target]} forgot Protego exists` });
      }
      if (event.type === "MATCH_END" && event.winner) {
        out.push({ text: `${playerName[opponentOf(event.winner)]} has been DEFEATED`, sound: "sadTrombone" });
      }
    }
    return out;
  }
}

const pickLine = (seed: number, lines: string[]) => lines[seed % lines.length];
