import { describe, expect, it } from "vitest";
import { CircleChargeCounter } from "../src/gesture/circleChargeCounter";
import { pointingHand, traceHand } from "./fixtures/pointingHand";

describe("pointed fingertip circle tracing",()=>{
  it.each([1,-1])("accepts a precise circle in direction %s",direction=>{
    const counter=new CircleChargeCounter(); const scores:number[]=[];
    for(let i=0;i<=96;i++){const f=counter.update([traceHand(i,direction)],i*30);if(f.result&&f.trace) scores.push(f.result.score);}
    expect(scores.length).toBe(1); expect(scores[0]).toBeGreaterThan(95);
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
  it("resets partial traces only after sustained tracking loss",()=>{
    const counter=new CircleChargeCounter();
    for(let i=0;i<24;i++) counter.update([traceHand(i)],i*30);
    counter.update([],2200);
    for(let i=24;i<=48;i++) expect(counter.update([traceHand(i)],2200+i*30).trace).toBeUndefined();
  });
  it("preserves a half circle across missing frames and completes on return",()=>{
    const counter=new CircleChargeCounter(); let completed=false;
    for(let i=0;i<=24;i++) counter.update([traceHand(i)],i*40);
    const paused=counter.update([],1200);
    expect(paused.progress).toBeCloseTo(.5);
    expect(paused.trail?.[0].at).toBe(0);
    for(let i=25;i<=48;i++) completed ||= !!counter.update([traceHand(i)],i*40+400).trace;
    expect(completed).toBe(true);
  });
  it("accepts an eight-second circle without replacing its starting point",()=>{
    const counter=new CircleChargeCounter(); let result;
    for(let i=0;i<=48;i++) {
      const feedback=counter.update([traceHand(i)],i*8000/48);
      if(i===30) { expect(feedback.progress).toBeGreaterThan(.5); expect(feedback.trail?.[0].at).toBe(0); }
      if(feedback.trace) result=feedback.result;
    }
    expect(result?.accuracy).toBe(100);
    expect(result!.durationMs).toBeGreaterThan(5000);
  });
  it("ignores a landmark spike without losing progress",()=>{
    const counter=new CircleChargeCounter(); let completed=false;
    for(let i=0;i<=24;i++) counter.update([traceHand(i)],i*40);
    const spike=counter.update([pointingHand(.02,.1)],980);
    expect(spike.progress).toBeCloseTo(.5);
    for(let i=25;i<=48;i++) completed ||= !!counter.update([traceHand(i)],i*40).trace;
    expect(completed).toBe(true);
  });
  it("allows imperfect curls and index foreshortening during a circle",()=>{
    const counter=new CircleChargeCounter(); let completed=false;
    for(let i=0;i<=48;i++) {
      const hand=traceHand(i);
      hand[6]={x:hand[0].x+(hand[8].x-hand[0].x)/1.08,y:hand[0].y+(hand[8].y-hand[0].y)/1.08,z:hand[0].z+(hand[8].z-hand[0].z)/1.08};
      // Tips a little farther from the wrist than their PIP joints were UNKNOWN before.
      for(const [pip,tip] of [[10,12],[14,16],[18,20]]) hand[tip]={...hand[pip],y:hand[0].y+(hand[pip].y-hand[0].y)*1.1};
      completed ||= !!counter.update([hand],i*40).trace;
    }
    expect(completed).toBe(true);
  });
  it("scores a rough circle lower instead of resetting when it wanders off the ring",()=>{
    const counter=new CircleChargeCounter(); let result;
    for(let i=0;i<=96;i++) {
      const theta=i*Math.PI/48, radius=.22+.13*Math.sin(theta)**2;
      const feedback=counter.update([pointingHand(1-(.5+radius*Math.cos(theta)),(.375+radius*Math.sin(theta))/.75)],i*40);
      if(feedback.trace) result=feedback.result;
    }
    expect(result).toBeDefined(); expect(result!.accuracy).toBeLessThan(70);
  });

  it("freezes the completed stroke and submits once until an explicit retry",()=>{
    const counter=new CircleChargeCounter(); let captured;
    for(let i=0;i<=48;i++) { const f=counter.update([traceHand(i)],i*40); if(f.trace) captured=f; }
    expect(captured?.completed).toBe(true);
    expect(captured!.trail!.length).toBeGreaterThan(30);
    for(const [hands,at] of [[[],3000],[[traceHand(12)],4000],[[],20000]] as const) {
      const frozen=counter.update(hands as Parameters<CircleChargeCounter["update"]>[0],at);
      expect(frozen.trail).toEqual(captured!.trail);
      expect(frozen.result).toEqual(captured!.result);
      expect(frozen.progress).toBe(1);
      expect(frozen.trace).toBeUndefined();
      expect(frozen.hint).toContain("captured");
    }
    counter.reset();
    expect(counter.update([traceHand(0)],21000).completed).toBe(false);
    let submitted=0;
    for(let i=1;i<=48;i++) submitted+=Number(!!counter.update([traceHand(i)],21000+i*40).trace);
    expect(submitted).toBe(1);
  });

});
