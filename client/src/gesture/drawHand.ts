import type { Landmark } from "./types";

// Bone pairs for drawing the 21-point hand skeleton.
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

// Shoulder–elbow–wrist chains from the body pose (Six Seven reads these).
const ARM_BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]];

export function drawHands(canvas: HTMLCanvasElement, hands: Landmark[][], pose?: Landmark[] | null) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  if (pose && pose.length >= 17) drawArms(ctx, pose, width, height);
  for (const landmarks of hands) drawSkeleton(ctx, landmarks, width, height);
}

function drawArms(ctx: CanvasRenderingContext2D, pose: Landmark[], width: number, height: number) {
  ctx.strokeStyle = "#72a9c0";
  ctx.lineWidth = 5;
  for (const [a, b] of ARM_BONES) {
    ctx.beginPath();
    ctx.moveTo(pose[a].x * width, pose[a].y * height);
    ctx.lineTo(pose[b].x * width, pose[b].y * height);
    ctx.stroke();
  }
}

function drawSkeleton(ctx: CanvasRenderingContext2D, landmarks: Landmark[], width: number, height: number) {
  ctx.strokeStyle = "#d9bd75";
  ctx.lineWidth = 3;
  for (const [a, b] of BONES) {
    ctx.beginPath();
    ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
    ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
    ctx.stroke();
  }
  ctx.fillStyle = "#f4efe5";
  for (const point of landmarks) {
    ctx.beginPath();
    ctx.arc(point.x * width, point.y * height, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
