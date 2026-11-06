// Capture & Compare, the capture side: freezes one camera frame together with the
// head pose tracked on exactly that frame, and works out a portrait crop around
// the face. TryOnScene fills a CapturedPhoto in its per-frame loop; the comparison
// view then renders every chosen frame onto this same photo and pose.
import * as THREE from 'three';
import { CONFIG } from './config.ts';
import type { RoomLight } from './lighting.ts';

/** A rectangle in 0..1 image coordinates, in the mirrored (selfie) view the user sees. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturedPhoto {
  /** The camera frame, unmirrored, at the camera's resolution. Tracking ran on this exact canvas. */
  canvas: HTMLCanvasElement;
  /** Head pose tracked on `canvas` (raw, unsmoothed: it belongs to this one frame). */
  headMatrix: THREE.Matrix4;
  /** The room light at the moment of capture, so every frame is lit the same way. */
  light: RoomLight;
  /** Portrait crop around the face, applied to every comparison photo. */
  crop: NormalizedRect;
}

/** Copies the video's current frame into a new canvas (one per capture, not per frame). */
export function copyVideoFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Portrait crop (CONFIG.compare.photoAspect) around the face landmarks, kept inside
 * the image. Landmarks are MediaPipe's: 0..1 of the *unmirrored* frame; the result
 * is in the mirrored view, because that is how the user sees themselves.
 */
export function faceCrop(
  landmarks: ReadonlyArray<{ x: number; y: number }>,
  imageWidth: number,
  imageHeight: number,
): NormalizedRect {
  const { photoAspect, cropHeightPerFace, cropWidthPerFace, cropRaise } = CONFIG.compare;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of landmarks) {
    const mirroredX = 1 - point.x;
    minX = Math.min(minX, mirroredX);
    maxX = Math.max(maxX, mirroredX);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) {
    // No landmarks: centre the largest crop that fits.
    minX = maxX = 0.5;
    minY = maxY = 0.5;
  }

  // Work in pixels so the aspect ratio is a real (not stretched) 4:5.
  const faceWidth = (maxX - minX) * imageWidth;
  const faceHeight = (maxY - minY) * imageHeight;
  let height = Math.max(faceHeight * cropHeightPerFace, (faceWidth * cropWidthPerFace) / photoAspect, 1);
  let width = height * photoAspect;
  if (width > imageWidth) {
    width = imageWidth;
    height = width / photoAspect;
  }
  if (height > imageHeight) {
    height = imageHeight;
    width = height * photoAspect;
  }

  const centreX = ((minX + maxX) / 2) * imageWidth;
  const centreY = ((minY + maxY) / 2) * imageHeight - height * cropRaise;
  const x = THREE.MathUtils.clamp(centreX - width / 2, 0, imageWidth - width);
  const y = THREE.MathUtils.clamp(centreY - height / 2, 0, imageHeight - height);
  return { x: x / imageWidth, y: y / imageHeight, width: width / imageWidth, height: height / imageHeight };
}

/**
 * Copies `crop` (mirrored-view coordinates) of an *unmirrored* source (the camera
 * frame or the WebGL canvas) into a new canvas, mirrored like the live view.
 */
export function copyMirroredCrop(
  source: HTMLCanvasElement,
  crop: NormalizedRect,
  outputHeight: number,
): HTMLCanvasElement {
  // The crop is measured in the mirrored view; in the unmirrored source the same
  // region starts at 1 - x - width.
  const sx = (1 - crop.x - crop.width) * source.width;
  const sy = crop.y * source.height;
  const sw = crop.width * source.width;
  const sh = crop.height * source.height;
  const height = Math.round(Math.min(outputHeight, sh));
  const width = Math.round((height * sw) / sh);

  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d');
  if (context) {
    context.imageSmoothingQuality = 'high';
    context.translate(width, 0);
    context.scale(-1, 1); // mirror, like the live view (CSS scaleX(-1) on the stage)
    context.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
  }
  return output;
}

/** Encodes a canvas as PNG and returns an object URL (revoke it when done). */
export function canvasToPngUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}

/**
 * Picks a frame in the comparison. A frame already chosen is removed. Otherwise it
 * fills an empty slot, or, when all slots are full, replaces the active one.
 * Returns the new slots and which slot is active afterwards.
 */
export function toggleFrame(
  slots: readonly string[],
  activeIndex: number,
  id: string,
  maxFrames: number,
): { slots: string[]; activeIndex: number } {
  const existing = slots.indexOf(id);
  if (existing >= 0) {
    const next = slots.filter((slotId) => slotId !== id);
    return { slots: next, activeIndex: Math.min(activeIndex, Math.max(next.length - 1, 0)) };
  }
  if (slots.length < maxFrames) {
    return { slots: [...slots, id], activeIndex: slots.length };
  }
  const replaceAt = THREE.MathUtils.clamp(activeIndex, 0, slots.length - 1);
  const next = [...slots];
  next[replaceAt] = id;
  return { slots: next, activeIndex: replaceAt };
}
