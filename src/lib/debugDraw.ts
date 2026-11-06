// Draws MediaPipe's face landmarks as dots on a 2D canvas laid over the video.
// Used only by the debug view, to check visually that tracking is accurate.
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CONFIG } from './config.ts';

const FULL_CIRCLE = Math.PI * 2;

export function drawLandmarks(canvas: HTMLCanvasElement, landmarks: NormalizedLandmark[] | null): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;

  // Landmarks are in 0..1 of the video frame; the canvas has the video's pixel size,
  // and it sits inside the mirrored stage, so no flipping is needed here.
  context.fillStyle = CONFIG.debug.landmarkColor;
  context.beginPath();
  for (const point of landmarks) {
    const x = point.x * canvas.width;
    const y = point.y * canvas.height;
    context.moveTo(x + CONFIG.debug.landmarkRadiusPx, y);
    context.arc(x, y, CONFIG.debug.landmarkRadiusPx, 0, FULL_CIRCLE);
  }
  context.fill();
}

export function clearDebugCanvas(canvas: HTMLCanvasElement): void {
  canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
}
