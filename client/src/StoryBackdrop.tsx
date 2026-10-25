/**
 * Flat storybook forest behind the menus: a lantern-lit dusk sky, a wizard's tower
 * on the far hill, rolling layers of round trees and pines, toadstools and fireflies.
 * Pure SVG, no assets.
 */

/** A puffy storybook tree: a trunk under a cluster of overlapping circles. */
function RoundTree({ x, y, s, fill, trunk }: { x: number; y: number; s: number; fill: string; trunk: string }) {
  return (
    <g>
      <rect x={x - 5 * s} y={y - 30 * s} width={10 * s} height={34 * s} rx={3 * s} fill={trunk} />
      <g fill={fill}>
        <circle cx={x} cy={y - 62 * s} r={34 * s} />
        <circle cx={x - 28 * s} cy={y - 40 * s} r={26 * s} />
        <circle cx={x + 28 * s} cy={y - 42 * s} r={27 * s} />
        <circle cx={x + 2 * s} cy={y - 32 * s} r={24 * s} />
      </g>
    </g>
  );
}

/** A layered pine: three stacked triangles. */
function Pine({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <path
      fill={fill}
      d={`M${x} ${y - 150 * s} L${x + 34 * s} ${y - 92 * s} L${x + 18 * s} ${y - 92 * s} L${x + 46 * s} ${y - 46 * s} L${x + 24 * s} ${y - 46 * s} L${x + 56 * s} ${y} L${x - 56 * s} ${y} L${x - 24 * s} ${y - 46 * s} L${x - 46 * s} ${y - 46 * s} L${x - 18 * s} ${y - 92 * s} L${x - 34 * s} ${y - 92 * s}z`}
    />
  );
}

function Toadstool({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g>
      <path fill="#f3e6cf" d={`M${x - 6 * s} ${y} Q${x - 7 * s} ${y - 18 * s} ${x - 5 * s} ${y - 22 * s} H${x + 5 * s} Q${x + 7 * s} ${y - 18 * s} ${x + 6 * s} ${y}z`} />
      <path fill="#d9473f" d={`M${x - 22 * s} ${y - 20 * s} Q${x} ${y - 52 * s} ${x + 22 * s} ${y - 20 * s}z`} />
      <g fill="#fff4e0">
        <circle cx={x - 9 * s} cy={y - 28 * s} r={3 * s} />
        <circle cx={x + 6 * s} cy={y - 34 * s} r={3.5 * s} />
        <circle cx={x + 12 * s} cy={y - 24 * s} r={2.2 * s} />
      </g>
    </g>
  );
}

const FIREFLIES = [
  [210, 610], [380, 540], [520, 650], [700, 590], [880, 640], [1010, 560], [1180, 620], [1340, 560], [1460, 650], [300, 700], [1260, 700], [620, 720],
];

const LANTERNS = [
  [240, 150, 1], [420, 90, 0.8], [600, 190, 0.7], [1040, 120, 0.9], [1220, 200, 0.7],
];

export function StoryBackdrop() {
  return (
    <div className="story-backdrop" aria-hidden="true">
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="sb-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4f8fd8" />
            <stop offset="0.45" stopColor="#8cc0ee" />
            <stop offset="0.75" stopColor="#cfe8f2" />
            <stop offset="0.9" stopColor="#f3efd6" />
          </linearGradient>
          <radialGradient id="sb-glow">
            <stop offset="0" stopColor="#ffe9a8" stopOpacity="0.9" />
            <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#sb-sky)" />

        {/* Sinking sun and floating lanterns */}
        <circle cx="1260" cy="470" r="70" fill="#fff3c4" />
        <g fill="#ffffff">
          <path d="M120 230h300c-14-26-44-34-70-24-18-34-74-38-98-6-30-12-62 6-62 30h-70z" />
          <path d="M1000 300h260c-12-22-40-30-62-20-20-36-80-36-104-2-34-10-66 4-70 22h-24z" opacity="0.9" />
          <path d="M640 66h220c-10-20-34-26-52-18-16-30-66-30-86-2-28-8-56 4-60 20h-22z" opacity="0.8" />
        </g>
        {LANTERNS.map(([x, y, s], i) => (
          <g key={i} className="sb-lantern" style={{ animationDelay: `${-i * 1.3}s` }}>
            <circle cx={x} cy={y} r={26 * s} fill="url(#sb-glow)" />
            <rect x={x - 8 * s} y={y - 11 * s} width={16 * s} height={22 * s} rx={5 * s} fill="#ffc46b" />
            <rect x={x - 8 * s} y={y + 7 * s} width={16 * s} height={4 * s} rx={2 * s} fill="#e08a3c" />
          </g>
        ))}

        {/* The beanstalk, twisting up into a cloud */}
        <g>
          <path d="M330 640 C250 560 410 500 330 420 S250 280 330 200 S410 80 340 -20" fill="none" stroke="#4f8f45" strokeWidth="26" strokeLinecap="round" />
          <path d="M346 640 C420 560 270 500 346 420 S420 280 346 200 S270 80 350 -20" fill="none" stroke="#6faa55" strokeWidth="16" strokeLinecap="round" />
          <g fill="#7cbf5b">
            {[[300, 560, -40], [372, 500, 35], [292, 400, -30], [376, 330, 40], [296, 250, -35], [374, 170, 30], [300, 90, -40], [370, 30, 35]].map(([x, y, r], i) => (
              <ellipse key={i} cx={x} cy={y} rx="34" ry="15" transform={`rotate(${r} ${x} ${y})`} />
            ))}
          </g>
          <g fill="none" stroke="#6faa55" strokeWidth="5" strokeLinecap="round">
            <path d="M360 460 c30 -6 40 -30 22 -42 c-14 -8 -26 4 -18 14" />
            <path d="M318 290 c-30 -4 -42 -28 -24 -40 c14 -8 26 4 18 14" />
          </g>
        </g>

        {/* Misty far hills */}
        <path fill="#9fbfa0" opacity="0.8" d="M0 520 C160 470 300 500 420 480 S700 430 860 470 S1180 440 1340 470 S1520 460 1600 480 V900 H0z" />

        {/* Wizard's tower on the far hill */}
        <g transform="translate(1330 345) scale(0.72)">
          <rect x="0" y="70" width="46" height="200" fill="#8e6a7d" />
          <rect x="-6" y="62" width="58" height="14" rx="3" fill="#7d5a6e" />
          <path d="M-14 66 L23 -40 L60 66z" fill="#5b3a6a" />
          <path d="M23 -40 l2 -18 l10 6z" fill="#f2b85e" />
          <rect x="15" y="110" width="16" height="24" rx="8" fill="#ffd27a" />
          <rect x="15" y="170" width="16" height="22" rx="8" fill="#ffd27a" opacity="0.8" />
          <rect x="46" y="150" width="30" height="120" fill="#8e6a7d" />
          <path d="M40 154 L61 96 L82 154z" fill="#5b3a6a" />
        </g>

        {/* Far forest line */}
        <path fill="#6f9a68" d="M0 600 C120 560 240 590 360 570 S620 540 760 575 S1060 540 1220 570 S1480 545 1600 565 V900 H0z" />
        <g>
          {[[60, 600, 0.9], [170, 590, 1.1], [300, 585, 0.8], [1260, 578, 1], [1390, 572, 0.85], [1520, 582, 1.15]].map(([x, y, s], i) => (
            <RoundTree key={i} x={x} y={y} s={s} fill="#6f9a68" trunk="#5a7a55" />
          ))}
        </g>

        {/* Middle forest */}
        <path fill="#3f6a49" d="M0 680 C180 640 360 670 520 650 S860 690 1040 660 S1400 640 1600 660 V900 H0z" />
        {[[40, 690, 1.3], [210, 670, 1.1], [1440, 665, 1.2], [1580, 680, 1.3]].map(([x, y, s], i) => (
          <RoundTree key={i} x={x} y={y} s={s} fill="#3f6a49" trunk="#2f4d36" />
        ))}
        {[[340, 670, 1], [1310, 668, 1.1]].map(([x, y, s], i) => (
          <Pine key={i} x={x} y={y} s={s} fill="#345c3e" />
        ))}

        {/* Near forest */}
        <path fill="#28452f" d="M0 770 C220 730 420 760 640 750 S1060 780 1280 750 S1500 735 1600 745 V900 H0z" />
        {[[110, 780, 1.6], [1480, 770, 1.7]].map(([x, y, s], i) => (
          <Pine key={i} x={x} y={y} s={s} fill="#203a27" />
        ))}
        {[[260, 770, 1.5], [1330, 765, 1.4]].map(([x, y, s], i) => (
          <RoundTree key={i} x={x} y={y} s={s} fill="#2a4a32" trunk="#1c3022" />
        ))}

        {/* Mossy ground with toadstools */}
        <path fill="#17241c" d="M0 840 C300 815 600 850 900 835 S1400 820 1600 840 V900 H0z" />
        <Toadstool x={380} y={842} s={1.2} />
        <Toadstool x={410} y={846} s={0.8} />
        <Toadstool x={1200} y={838} s={1.1} />
        <Toadstool x={1228} y={842} s={0.7} />

        {/* Fireflies */}
        {FIREFLIES.map(([x, y], i) => (
          <g key={i} className="sb-firefly" style={{ animationDelay: `${-(i * 0.9) % 6}s` }}>
            <circle cx={x} cy={y} r="9" fill="url(#sb-glow)" />
            <circle cx={x} cy={y} r="2.2" fill="#fff2b0" />
          </g>
        ))}
      </svg>
    </div>
  );
}
