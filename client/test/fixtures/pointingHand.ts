import type { Landmark } from "../../src/gesture/types";
export function pointingHand(x:number,y:number): Landmark[] {
  const h=Array.from({length:21},()=>({x,y:y+.08,z:0}));
  for(const i of [6,10,14,18]) h[i]={x,y:y+.035,z:0};
  for(const i of [12,16,20]) h[i]={x,y:y+.06,z:0};
  h[8]={x,y,z:-.025};
  return h;
}
export const traceHand=(i:number,direction=1,radius=.22)=>pointingHand(1-(.5+radius*Math.cos(i*Math.PI/24*direction)),(.375+radius*Math.sin(i*Math.PI/24*direction))/.75);
