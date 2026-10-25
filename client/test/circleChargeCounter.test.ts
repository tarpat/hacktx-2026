import { describe, expect, it } from "vitest";
import { CircleChargeCounter } from "../src/gesture/circleChargeCounter";
import type { Landmark } from "../src/gesture/types";

export const handAt = (x: number, y: number): Landmark[] => Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
const circle = (i: number, direction = 1, radius = 0.16) => handAt(0.5 + radius * Math.cos(i * Math.PI / 16 * direction), 0.5 + radius * Math.sin(i * Math.PI / 16 * direction));

describe("camera circle charging", () => {
  it.each([1, -1])("scores consecutive circles in direction %s", direction => {
    const counter = new CircleChargeCounter();
    let pushes = 0;
    for (let i = 0; i <= 96; i++) pushes += Number(counter.update([circle(i, direction)], i * 40).push);
    expect(pushes).toBe(3);
  });
  it("accepts an oval and smaller comfortable circles", () => {
    const counter = new CircleChargeCounter(); let pushes = 0;
    for (let i = 0; i <= 32; i++) {
      const theta = i * Math.PI / 16;
      pushes += Number(counter.update([handAt(.5 + .08 * Math.cos(theta), .5 + .12 * Math.sin(theta))], i * 50).push);
    }
    expect(pushes).toBe(1);
  });
  it.each(["still", "jitter", "wave", "arc", "tiny"])("does not score %s motion", motion => {
    const counter = new CircleChargeCounter();
    for (let i = 0; i < 150; i++) {
      const t = i * .2;
      const hand = motion === "still" ? handAt(.5,.5) : motion === "jitter" ? handAt(.5+.006*Math.cos(t),.5+.006*Math.sin(t)) : motion === "wave" ? handAt(.5+.2*Math.sin(t),.5) : motion === "arc" ? handAt(.5+.16*Math.cos(Math.sin(t)),.5+.16*Math.sin(Math.sin(t))) : circle(i,1,.02);
      expect(counter.update([hand],i*40).push).toBe(false);
    }
  });
  it("clears a partial circle after lost tracking, long gaps, or reset", () => {
    for (const interruption of ["missing", "gap", "reset"]) {
      const counter=new CircleChargeCounter();
      for (let i=0;i<=16;i++) counter.update([circle(i)],i*40);
      if(interruption === "missing") counter.update([],680);
      if(interruption === "reset") counter.reset();
      for(let i=17;i<=32;i++) expect(counter.update([circle(i)],i*40+(interruption === "gap" ? 1000 : 0)).push).toBe(false);
    }
  });
  it("follows the same hand if two detections reorder", () => {
    const counter=new CircleChargeCounter(); let pushes=0;
    for(let i=0;i<=32;i++) {
      const moving=circle(i), other=handAt(.1,.1);
      pushes+=Number(counter.update(i%2 ? [other,moving] : [moving,other],i*40).push);
    }
    expect(pushes).toBe(1);
  });
  it("rejects invalid detections and duplicate timestamps", () => {
    const counter=new CircleChargeCounter();
    expect(counter.update([handAt(NaN,.5)],0).visible).toBe(false);
    expect(counter.update([circle(0)],0).push).toBe(false);
    expect(counter.update([handAt(2,.5)],40).visible).toBe(false);
  });
});
