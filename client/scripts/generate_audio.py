"""Generate original, deterministic placeholder effects; Python standard library only."""
import math
from pathlib import Path
import random
import struct
import wave

RATE = 22050
OUT = Path(__file__).resolve().parents[1] / "public" / "audio"
OUT.mkdir(parents=True, exist_ok=True)


def render(name, duration, signal):
    rng = random.Random(name)
    samples = []
    count = int(RATE * duration)
    for i in range(count):
        t = i / RATE
        # Short attack/release eliminates edge clicks. Keep ample amplitude headroom.
        envelope = min(1, t / 0.012, (duration - t) / 0.04)
        value = max(-0.8, min(0.8, signal(t, rng) * envelope))
        samples.append(struct.pack("<h", round(value * 32767)))
    with wave.open(str(OUT / f"{name}.wav"), "wb") as output:
        output.setparams((1, 2, RATE, count, "NONE", "not compressed"))
        output.writeframes(b"".join(samples))


def tone(hz, t):
    return math.sin(2 * math.pi * hz * t)


render("cast", 0.5, lambda t, r: (0.35 * tone(220, t) + 0.18 * r.uniform(-1, 1)) * math.exp(-4 * t))
render("shield", 0.65, lambda t, r: (0.22 * tone(523.25, t) + 0.18 * tone(783.99, t)) * math.exp(-3 * t))
render("block", 0.3, lambda t, r: (0.25 * tone(1100, t) + 0.22 * r.uniform(-1, 1)) * math.exp(-10 * t))
render("hit", 0.32, lambda t, r: (0.4 * tone(100, t) + 0.15 * r.uniform(-1, 1)) * math.exp(-9 * t))
render("countdown", 0.2, lambda t, r: 0.35 * tone(660, t))


def victory(t, rng):
    notes = (523.25, 659.25, 783.99, 1046.5)
    index = min(3, int(t / 0.18))
    local = t - index * 0.18
    return 0.32 * tone(notes[index], local) * min(1, local / 0.008) * math.exp(-3 * local)


render("victory", 1.05, victory)
