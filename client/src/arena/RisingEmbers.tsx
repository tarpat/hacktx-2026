/** Drifting motes over the backdrop; positions are fixed so renders don't reshuffle them. */
const MOTES = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i * 0.7) % 9}s`,
  duration: `${9 + (i % 5) * 2}s`,
  size: `${2 + (i % 3)}px`,
}));

/** Shared ambience for the lobby and the arena, above the painting and below the HUD. */
export function RisingEmbers() {
  return <div className="rising-embers" aria-hidden="true">
    {MOTES.map((m, i) => <i key={i} style={{ left: m.left, animationDelay: `-${parseFloat(m.delay) + parseFloat(m.duration)}s`, animationDuration: m.duration, width: m.size, height: m.size }} />)}
  </div>;
}
