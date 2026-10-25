export interface TracePoint { x: number; y: number; at: number }
export interface CircleTrace { startedAt: number; points: TracePoint[] }
export interface TraceResult { score: number; accuracy: number; durationMs: number }
/** Coordinates match a mirrored 4:3 camera preview; y uses image-width units. */
export const TRACE_MAX_DURATION_MS = 14_000;
export const TRACE_TARGET = { x: 0.5, y: 0.375, radius: 0.22 };

/** Shared by camera feedback and the server, which never trusts a client-provided score. */
export function scoreCircleTrace(points: TracePoint[]): TraceResult | null {
  if (!Array.isArray(points) || points.length < 16 || points.length > 180) return null;
  if (points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.at) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > .75)) return null;
  const durationMs = points[points.length-1].at - points[0].at;
  if (durationMs < 400 || durationMs > TRACE_MAX_DURATION_MS) return null;
  let turn=0, travel=0, error=0;
  const bins=new Set<number>();
  for(let i=0;i<points.length;i++) {
    const p=points[i], angle=Math.atan2(p.y-TRACE_TARGET.y,p.x-TRACE_TARGET.x);
    const radial=Math.hypot(p.x-TRACE_TARGET.x,p.y-TRACE_TARGET.y);
    error+=(radial-TRACE_TARGET.radius)**2;
    bins.add(Math.floor((angle+Math.PI)/(2*Math.PI)*24)%24);
    if(i) {
      if(p.at<=points[i-1].at) return null;
      const prev=Math.atan2(points[i-1].y-TRACE_TARGET.y,points[i-1].x-TRACE_TARGET.x);
      const delta=Math.atan2(Math.sin(angle-prev),Math.cos(angle-prev));
      if(Math.abs(delta)>Math.PI/3) return null;
      // Fill angular coverage across short tracking gaps. Do not require a
      // detection in every sector when a camera drops a few frames.
      const steps=Math.ceil(Math.abs(delta)/(Math.PI/24));
      for(let j=1;j<=steps;j++) {
        const angle=prev+delta*j/steps;
        const wrapped=(angle+Math.PI+Math.PI*2)%(Math.PI*2);
        bins.add(Math.floor(wrapped/(2*Math.PI)*24)%24);
      }
      turn+=delta; travel+=Math.abs(delta);
    }
  }
  const first=points[0], last=points[points.length-1];
  if(bins.size<22 || Math.abs(turn)<Math.PI*1.85 || Math.abs(turn)>Math.PI*2.2 || Math.abs(turn)/travel<.75 || Math.hypot(last.x-first.x,last.y-first.y)>.08) return null;
  const accuracy=Math.max(0,1-Math.sqrt(error/points.length)/(.22*.5));
  // Roundness/target accuracy is 80%; speed contributes at most 20%.
  const speed=Math.max(0,Math.min(1,(5000-durationMs)/4600));
  return {score:Math.round(80*accuracy+20*speed),accuracy:Math.round(accuracy*100),durationMs};
}

/** Higher score wins; accuracy then completion time break rounded-score ties. */
export function compareTraceResults(a: TraceResult | null, b: TraceResult | null): number {
  if(!a || !b) return a ? 1 : b ? -1 : 0;
  return a.score-b.score || a.accuracy-b.accuracy || b.durationMs-a.durationMs;
}
