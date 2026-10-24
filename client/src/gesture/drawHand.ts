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
