import { scoreCircleTrace, TRACE_TARGET, TRACE_MAX_DURATION_MS, type TracePoint, type TraceResult } from "@spellcaster/shared";
import type { Landmark } from "./types";

export interface CircleChargeFeedback {
  visible: boolean;
  progress: number;
  hint: string;
  trail?: TracePoint[];
  result?: TraceResult;
  trace?: TracePoint[];
}

const TRACKING_GRACE_MS = 1200;
const distance = (a: TracePoint, b: TracePoint) => Math.hypot(a.x-b.x,a.y-b.y);

/** More forgiving than the casting classifier: pointing at the camera foreshortens fingers.
 * Ambiguous frames pause the trace; an open palm still cannot acquire or advance it.
 */
function isPointing(hand: Landmark[]): boolean {
  if(hand.length<21 || !hand.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z))) return false;
  const d=(i:number)=>Math.hypot(hand[i].x-hand[0].x,hand[i].y-hand[0].y,hand[i].z-hand[0].z);
  const index=d(8)/Math.max(.001,d(6));
  const folded=[[10,12],[14,16],[18,20]].filter(([pip,tip])=>d(tip)/Math.max(.001,d(pip))<1.3).length;
  return index>=1.03 && folded>=2;
}

/** Preserve the beginning of a trace until completion or sustained tracking loss. */
export class CircleChargeCounter {
  private path: TracePoint[]=[];
  private lastFrame=-Infinity;
  private lastPointAt=-Infinity;
  private result: TraceResult | undefined;

  reset() { this.path=[]; this.lastFrame=-Infinity; this.lastPointAt=-Infinity; this.result=undefined; }

  private progress(): number {
    let turn=0;
    for(let i=1;i<this.path.length;i++) {
      const a=Math.atan2(this.path[i-1].y-TRACE_TARGET.y,this.path[i-1].x-TRACE_TARGET.x);
      const b=Math.atan2(this.path[i].y-TRACE_TARGET.y,this.path[i].x-TRACE_TARGET.x);
      turn+=Math.atan2(Math.sin(b-a),Math.cos(b-a));
    }
    return Math.min(.99,Math.abs(turn)/(Math.PI*2));
  }

  update(hands: Landmark[][], now: number): CircleChargeFeedback & { push: boolean } {
    const feedback=(visible:boolean,hint:string,trace?:TracePoint[])=>({visible,hint,progress:trace ? 1 : this.progress(),push:!!trace,trail:[...this.path],result:this.result,trace});
    if(now<=this.lastFrame) return feedback(false,"Point your index finger toward the screen.");
    this.lastFrame=now;
    if(this.path.length && (now-this.lastPointAt>TRACKING_GRACE_MS || now-this.path[0].at>TRACE_MAX_DURATION_MS)) {
      this.path=[];
    }
    const tips=hands.filter(isPointing).map(h=>({x:1-h[8].x,y:h[8].y*.75,at:now}));
    const last=this.path[this.path.length-1];
    const tip=last ? tips.sort((a,b)=>distance(a,last)-distance(b,last))[0] : tips[0];
    if(!tip || tip.x<0 || tip.x>1 || tip.y<0 || tip.y>.75) {
      return feedback(false,this.path.length ? "Tracking paused · keep pointing. Your circle is saved." : "Point one index finger at the screen; curl your other fingers.");
    }
    // Ignore a single landmark spike instead of throwing away the whole attempt.
    // Players can return close to the trail's tip to continue after an interruption.
    if(last && distance(tip,last)>.2) return feedback(false,"Move back near the end of your trail to continue.");
    this.lastPointAt=now;
    const radial=Math.hypot(tip.x-TRACE_TARGET.x,tip.y-TRACE_TARGET.y);
    if(!this.path.length && Math.abs(radial-TRACE_TARGET.radius)>.1) return feedback(true,"Move your fingertip onto the golden circle to begin.");
    if(!this.path.length || distance(tip,this.path[this.path.length-1])>.009) this.path.push(tip);
    // Thin old samples evenly; never discard the beginning of a slower circle.
    if(this.path.length>180) this.path=this.path.filter((_,i)=>i%2===0 || i===this.path.length-1);
    const result=scoreCircleTrace(this.path);
    if(result) {
      const trace=[...this.path]; this.result=result; this.path=[tip];
      return feedback(true,`${result.accuracy}% accuracy · ${(result.durationMs/1000).toFixed(2)}s · ${result.score}/100`,trace);
    }
    return feedback(true,"Trace the golden circle smoothly · imperfect circles still score.");
  }
}
