import { describe,expect,it } from "vitest";
import { scoreCircleTrace, DuelEngine, DEFAULT_MATCH_CONFIG as C } from "../src/index.js";
const circle=(duration=1400,rx=.22,ry=.22)=>Array.from({length:49},(_,i)=>({x:.5+rx*Math.cos(i*Math.PI/24),y:.375+ry*Math.sin(i*Math.PI/24),at:i*duration/48}));
describe("circle accuracy and speed scoring",()=>{
 it("rewards accuracy most and speed second",()=>{
  expect(scoreCircleTrace(circle(900))!.score).toBe(98);
  expect(scoreCircleTrace(circle(2500))!.score).toBe(91);
  expect(scoreCircleTrace(circle(900,.25,.17))!.score).toBeLessThan(90);
 });
 it("rejects partial circles, backtracking, impossible timing, and invalid coordinates",()=>{
  expect(scoreCircleTrace(circle().slice(0,25))).toBeNull();
  expect(scoreCircleTrace(circle(100))).toBeNull();
  expect(scoreCircleTrace(circle().map(p=>({...p,x:NaN})))).toBeNull();
  expect(scoreCircleTrace(circle().map(p=>({...p,at:0})))).toBeNull();
 });
 it("keeps best attempts, rejects stale events and lets the higher score win at timeout",()=>{
  const engine=new DuelEngine(10000,C,()=>.1), live=10000+C.countdownMs;
  engine.tick(live);engine.cast("A","fireball",live);engine.cast("B","fireball",live);
  const clash=engine.snapshot(live+1000).struggle!;
  expect(engine.circleTrace("A",{startedAt:0,points:circle()},clash.startedAt+1500)).toBe(false);
  expect(engine.circleTrace("A",{startedAt:clash.startedAt,points:circle(1400)},clash.startedAt+1500)).toBe(true);
  expect(engine.circleTrace("A",{startedAt:clash.startedAt,points:circle(2000)},clash.startedAt+2200)).toBe(false);
  expect(engine.circleTrace("B",{startedAt:clash.startedAt,points:circle(1200)},clash.startedAt+2300)).toBe(true);
  expect(engine.snapshot(clash.startedAt+2300).struggle).not.toBeNull();
  engine.drainEvents();engine.tick(clash.endsAt+1);
  expect(engine.drainEvents().find(e=>e.type==="SPELL_CLASH")).toMatchObject({winner:"B"});
 });
});
