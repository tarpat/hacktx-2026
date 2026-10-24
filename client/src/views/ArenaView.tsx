import { useEffect, useRef } from "react";
import Phaser from "phaser";

class ArenaScene extends Phaser.Scene {
  constructor() { super("arena"); }
  create() {
    const { width, height } = this.scale;
    this.add.rectangle(width / 2, height * 0.78, width, height * 0.44, 0x28213a).setDepth(0);
    this.add.ellipse(width * 0.25, height * 0.67, 150, 210, 0x7955a8).setDepth(1);
    this.add.ellipse(width * 0.75, height * 0.67, 150, 210, 0x4d83a7).setDepth(1);
    this.add.triangle(width * 0.25, height * 0.48, -54, 54, 54, 54, 0, -85, 0xe9d4a5).setDepth(2);
    this.add.triangle(width * 0.75, height * 0.48, -54, 54, 54, 54, 0, -85, 0xe9d4a5).setDepth(2);
    this.add.circle(width * 0.5, height * 0.55, 9, 0xf4d36f).setDepth(3);
  }
}

export function ArenaView() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({ type: Phaser.AUTO, parent: host.current, backgroundColor: "#171326", scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" }, scene: ArenaScene });
    return () => game.destroy(true);
  }, []);
  return <main className="arena-shell"><header className="arena-header"><span className="brand-mark">✦</span> SPELLCASTER <span className="arena-status">PRACTICE ARENA · PHASE 0</span></header><section className="hud"><div className="fighter"><span>PLAYER A</span><div className="hp-track"><i /></div><b>100</b></div><div className="timer">01:30</div><div className="fighter opponent"><span>PLAYER B</span><div className="hp-track"><i /></div><b>100</b></div></section><div className="arena-canvas" ref={host} /><div className="arena-caption"><span>✧</span> THE DUEL BEGINS SOON <span>✧</span></div></main>;
}
