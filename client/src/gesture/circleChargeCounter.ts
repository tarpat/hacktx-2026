import { scoreCircleTrace, TRACE_TARGET, type TracePoint, type TraceResult } from "@spellcaster/shared";
import { classifyPose } from "./poseClassifier";
import type { Landmark } from "./types";

export interface CircleChargeFeedback {
  visible: boolean;
  progress: number;
  hint: string;
  trail?: TracePoint[];
  result?: TraceResult;
  trace?: TracePoint[];
}

/** Index fingertip traces a fixed camera-space circle while the other fingers are curled. */
export class CircleChargeCounter {
  private path: TracePoint[]=[];
  private lastFrame=-Infinity;
  private lastPointAt=-Infinity;
  private result: TraceResult | undefined;
  reset() { this.path=[]; this.lastFrame=-Infinity; this.lastPointAt=-Infinity; this.result=undefined; }

  update(hands: Landmark[][], now: number): CircleChargeFeedback & { push: boolean } {
    const feedback=(visible:boolean,hint:string,progress=0,trace?:TracePoint[])=>({visible,hint,progress,push:!!trace,trail:[...this.path],result:this.result,trace});
    if(now<=this.lastFrame) return feedback(false,"Point your index finger toward the screen.");
    if(now-this.lastFrame>300) this.path=[];
    this.lastFrame=now;
    const tips=hands.filter(h=>h.length>=21 && h.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z)) && classifyPose(h)==="POINT")
      .map(h=>({x:1-h[8].x,y:h[8].y*.75,at:now}));
    const last=this.path[this.path.length-1];
    const tip=last ? tips.sort((a,b)=>Math.hypot(a.x-last.x,a.y-last.y)-Math.hypot(b.x-last.x,b.y-last.y))[0] : tips[0];
    if(!tip || tip.x<0 || tip.x>1 || tip.y<0 || tip.y>.75) {
      if(now-this.lastPointAt>150) this.path=[];
      return feedback(false,"Point one index finger at the screen; curl your other fingers.");
    }
    this.lastPointAt=now;
    const radial=Math.hypot(tip.x-TRACE_TARGET.x,tip.y-TRACE_TARGET.y);
    if(Math.abs(radial-TRACE_TARGET.radius)>.12 || (last && Math.hypot(tip.x-last.x,tip.y-last.y)>.18)) this.path=[];
    if(!this.path.length && Math.abs(radial-TRACE_TARGET.radius)>.07) return feedback(true,"Move your fingertip onto the golden circle to begin.");
    if(this.path.length && now-this.path[0].at>5000) this.path=[];
    if(!this.path.length || Math.hypot(tip.x-this.path[this.path.length-1].x,tip.y-this.path[this.path.length-1].y)>.009) this.path.push(tip);
    if(this.path.length>180) this.path.shift();
    let turn=0;
    for(let i=1;i<this.path.length;i++) {
      const a=Math.atan2(this.path[i-1].y-TRACE_TARGET.y,this.path[i-1].x-TRACE_TARGET.x), b=Math.atan2(this.path[i].y-TRACE_TARGET.y,this.path[i].x-TRACE_TARGET.x);
      turn+=Math.atan2(Math.sin(b-a),Math.cos(b-a));
    }
    const result=scoreCircleTrace(this.path);
    if(result) {
      const trace=[...this.path]; this.result=result; this.path=[tip];
      return feedback(true,`${result.accuracy}% accuracy · ${(result.durationMs/1000).toFixed(2)}s · ${result.score}/100`,1,trace);
    }
    return feedback(true,"Trace the golden circle smoothly and quickly · either direction.",Math.min(.99,Math.abs(turn)/(Math.PI*2)));
  }
}
