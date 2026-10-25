import { describe, expect, it } from "vitest";
import { CircleChargeCounter } from "../src/gesture/circleChargeCounter";
import { pointingHand, traceHand } from "./fixtures/pointingHand";

describe("pointed fingertip circle tracing",()=>{
  it.each([1,-1])("accepts a precise circle in direction %s",direction=>{
    const counter=new CircleChargeCounter(); const scores:number[]=[];
    for(let i=0;i<=96;i++){const f=counter.update([traceHand(i,direction)],i*30);if(f.result&&f.trace) scores.push(f.result.score);}
    expect(scores.length).toBe(2); expect(scores[0]).toBeGreaterThan(95);
  });
  it("requires a pointed index finger, not a waving open palm",()=>{
    const counter=new CircleChargeCounter();
    for(let i=0;i<=48;i++) {
      const h=traceHand(i);
      for(const tip of [12,16,20]) h[tip]={...h[8]};
      expect(counter.update([h],i*30).trace).toBeUndefined();
    }
  });
  it("does not complete straight waves or small circles away from the target",()=>{
    for(const radius of [.02,.08]) {
      const counter=new CircleChargeCounter();
      for(let i=0;i<100;i++) expect(counter.update([traceHand(i,1,radius)],i*30).trace).toBeUndefined();
    }
    const counter=new CircleChargeCounter();
    for(let i=0;i<100;i++) expect(counter.update([pointingHand(.5+.22*Math.sin(i*.2),.5)],i*30).trace).toBeUndefined();
  });
  it("resets partial traces after tracking loss",()=>{
    const counter=new CircleChargeCounter();
    for(let i=0;i<24;i++) counter.update([traceHand(i)],i*30);
    counter.update([],1000);
    for(let i=24;i<=48;i++) expect(counter.update([traceHand(i)],1000+i*30).trace).toBeUndefined();
  });
});
