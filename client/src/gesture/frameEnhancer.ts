/** Mean brightness (0–1) the enhancer aims for; dim webcam frames sit well below this. */
const TARGET_LUMA = 0.45;
const MAX_GAIN = 2.2;
/** Re-measure brightness every this many frames; lighting changes slowly. */
const MEASURE_EVERY = 10;

/**
 * Brightens dim frames before hand tracking, so the model still finds hands in a dark room.
 * Only the model's copy is changed; the player's preview is untouched. Bright frames pass through as-is.
 */
export class FrameEnhancer {
  private canvas: OffscreenCanvas | null = null;
  private ctx: OffscreenCanvasRenderingContext2D | null = null;
  private probe = new OffscreenCanvas(16, 12).getContext("2d", { willReadFrequently: true });
  private gain = 1;
  private frames = 0;

  enhance(frame: ImageBitmap): ImageBitmap | OffscreenCanvas {
    if (this.frames++ % MEASURE_EVERY === 0) this.measure(frame);
    if (this.gain < 1.05) return frame;
    if (!this.canvas || this.canvas.width !== frame.width || this.canvas.height !== frame.height) {
      this.canvas = new OffscreenCanvas(frame.width, frame.height);
      this.ctx = this.canvas.getContext("2d");
    }
    if (!this.ctx) return frame;
    // Dim frames are also flat, so lift contrast a little alongside brightness.
    this.ctx.filter = `brightness(${this.gain.toFixed(2)}) contrast(${(1 + (this.gain - 1) * 0.3).toFixed(2)})`;
    this.ctx.drawImage(frame, 0, 0);
    return this.canvas;
  }

  private measure(frame: ImageBitmap) {
    if (!this.probe) return;
    this.probe.drawImage(frame, 0, 0, 16, 12);
    const { data } = this.probe.getImageData(0, 0, 16, 12);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const luma = sum / (data.length / 4) / 255;
    const target = Math.min(MAX_GAIN, Math.max(1, TARGET_LUMA / Math.max(luma, 0.02)));
    // Ease toward the new gain so auto-exposure swings don't make the model's input flicker.
    this.gain += (target - this.gain) * 0.5;
  }
}
