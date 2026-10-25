import { useEffect, useState } from "react";
import { art } from "../theme";

const asset = (name: string) => `${import.meta.env.BASE_URL}assets/${name}`;

/** Story beats in milliseconds from the start. */
const BEATS = {
  villainLine: 600,
  queenLine: 3200,
  summon: 5800,
  championLine: 6500,
  queenFlees: 8800,
  loading: 10000,
  done: 12400,
} as const;

type Beat = keyof typeof BEATS;

const SEEN_KEY = "spellcaster:intro-seen";

/** True if the intro already played this session (it shows once, not before every rematch). */
export function introSeen() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage blocked: the intro may simply play again next time.
  }
}

/**
 * A 12-second storybook intro: the Green Wizard threatens Queen Marigold's village, she
 * summons the Purple Wizard as her champion and runs for safety, then the arena loads.
 * Click Skip or press any key to jump straight to the duel.
 */
export function IntroCutscene({ onDone }: { onDone: () => void }) {
  const [reached, setReached] = useState<Set<Beat>>(new Set());
  const [dots, setDots] = useState(1);

  useEffect(() => {
    const finish = () => {
      markSeen();
      onDone();
    };
    const timers = (Object.entries(BEATS) as [Beat, number][]).map(([beat, at]) =>
      window.setTimeout(() => (beat === "done" ? finish() : setReached((prev) => new Set(prev).add(beat))), at),
    );
    const dotTimer = window.setInterval(() => setDots((d) => (d % 3) + 1), 400);
    const skip = (event: KeyboardEvent) => {
      if (event.repeat) return;
      finish();
    };
    window.addEventListener("keydown", skip);
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearInterval(dotTimer);
      window.removeEventListener("keydown", skip);
    };
  }, [onDone]);

  const at = (beat: Beat) => reached.has(beat);
  const bubble = (beat: Beat, until: Beat) => at(beat) && !at(until);

  return (
    <div className={`story ${at("loading") ? "is-loading" : ""}`}>
      <div className="story-stage" style={{ backgroundImage: `url(${asset("intro-town.jpg")})` }}>
        <figure className="story-actor story-villain">
          <img src={art.wizard.A} alt="The Green Wizard" />
          {bubble("villainLine", "queenLine") && <p className="story-bubble">Your kingdom is MINE, Your Majesty!</p>}
        </figure>

        <figure className={`story-actor story-queen ${at("queenFlees") ? "fleeing" : ""}`}>
          <img src={asset(at("queenFlees") ? "queen-run.png" : "queen-stand.png")} alt="Queen Marigold" />
          {bubble("queenLine", "summon") && <p className="story-bubble">Never! I summon my champion!</p>}
        </figure>

        {at("summon") && <div className="story-flash" />}
        <figure className={`story-actor story-champion ${at("summon") ? "arrived" : ""}`}>
          <img src={art.wizard.B} alt="The Purple Wizard" />
          {bubble("championLine", "loading") && <p className="story-bubble">Let's settle this... DUEL!</p>}
        </figure>
      </div>

      <div className="story-loading" aria-live="polite">
        <p>
          Preparing the arena<span className="story-dots">{".".repeat(dots)}</span>
        </p>
      </div>

      <button
        className="story-skip"
        onClick={() => {
          markSeen();
          onDone();
        }}
      >
        Skip ▸
      </button>
    </div>
  );
}
