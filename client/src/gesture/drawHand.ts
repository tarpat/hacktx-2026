import { TRACE_TARGET } from "@spellcaster/shared";
import type { CircleChargeFeedback } from "./circleChargeCounter";
import type { Landmark } from "./types";
// Bone pairs for drawing the 21-point hand skeleton.
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export function drawHands(canvas: HTMLCanvasElement, hands: Landmark[][], color = "#f6c453") {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  for (const landmarks of hands) drawSkeleton(ctx, landmarks, width, height, color);
}

function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: Landmark[], width: number, height: number, color: string) {
  // Glowing strokes read as magic traced by the hand.
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
    ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    ctx.stroke();
  }
  ctx.shadowBlur = 8;
  ctx.fillStyle = "#fff4dc";
  for (const point of landmarks) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

export function drawTraceGuide(canvas: HTMLCanvasElement, circleFeedback: CircleChargeFeedback | null) {
  const ctx=canvas.getContext("2d");
  if(ctx) {
    const w=canvas.width;
    ctx.save(); ctx.shadowBlur=0; ctx.strokeStyle="#f6c453"; ctx.lineWidth=3; ctx.setLineDash([9,7]);
    ctx.beginPath(); ctx.arc(TRACE_TARGET.x*w,TRACE_TARGET.y*w,TRACE_TARGET.radius*w,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]); ctx.strokeStyle="#7dffb0"; ctx.lineWidth=4; ctx.beginPath();
    circleFeedback?.trail?.forEach((p,i)=>{ if(i) ctx.lineTo((1-p.x)*w,p.y*w); else ctx.moveTo((1-p.x)*w,p.y*w); }); ctx.stroke();
    const tip=circleFeedback?.trail?.at(-1);
    if(tip) { ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc((1-tip.x)*w,tip.y*w,6,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }
}
