// One Euro filter (Casiez, Roussel & Vogel, CHI 2012): removes jitter from a noisy
// signal while keeping lag low. It is a low-pass filter whose cutoff frequency
// rises with speed: when the head is still it smooths hard (kills jitter); when
// the head moves fast it smooths little (avoids the glasses trailing behind).
// PoseFilter applies it to the head pose: RAW pose in -> SMOOTHED pose out.
import * as THREE from 'three';
import type { Pose } from './poseMath.ts';

export interface OneEuroSettings {
  /** Cutoff (Hz) when still. Lower = smoother but more lag at slow speeds. */
  minCutoff: number;
  /** How much the cutoff rises with speed. Higher = less lag when moving, more jitter. */
  beta: number;
  /** Cutoff (Hz) for smoothing the speed estimate itself. Rarely needs changing. */
  derivativeCutoff: number;
}

/**
 * Weight of the new sample in an exponential moving average, for a given cutoff
 * frequency and time step. This is what makes the filter frame-rate independent:
 * a longer gap between frames gives the new sample more weight.
 */
export function smoothingFactor(cutoffHz: number, dtSec: number): number {
  const timeConstant = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + timeConstant / dtSec);
}

/** Filters one number over time. */
export class OneEuroFilter {
  private previousValue: number | null = null;
  private previousDerivative = 0;
  private previousTimeSec = 0;
  private readonly settings: OneEuroSettings;

  constructor(settings: OneEuroSettings) {
    this.settings = settings;
  }

  filter(value: number, timeSec: number): number {
    if (this.previousValue === null) {
      // First sample: nothing to smooth against yet.
      this.previousValue = value;
      this.previousTimeSec = timeSec;
      return value;
    }
    const dt = timeSec - this.previousTimeSec;
    if (dt <= 0) return this.previousValue; // same timestamp: keep the last output

    // 1. Estimate speed, smoothed with a fixed cutoff so noise doesn't look like motion.
    const rawDerivative = (value - this.previousValue) / dt;
    const derivativeAlpha = smoothingFactor(this.settings.derivativeCutoff, dt);
    const derivative = derivativeAlpha * rawDerivative + (1 - derivativeAlpha) * this.previousDerivative;

    // 2. Faster movement -> higher cutoff -> less smoothing -> less lag.
    const cutoff = this.settings.minCutoff + this.settings.beta * Math.abs(derivative);
    const alpha = smoothingFactor(cutoff, dt);
    const filtered = alpha * value + (1 - alpha) * this.previousValue;

    this.previousValue = filtered;
    this.previousDerivative = derivative;
    this.previousTimeSec = timeSec;
    return filtered;
  }

  reset(): void {
    this.previousValue = null;
    this.previousDerivative = 0;
  }
}

/**
 * Smooths a head pose: 3 filters for position (cm) and 4 for the rotation
 * quaternion's components. Filtering quaternion components then re-normalising
 * is a simple, standard approximation that works well for the small changes
 * between consecutive frames. Scale is copied (MediaPipe always reports 1).
 */
export class PoseFilter {
  private readonly position: OneEuroFilter[];
  private readonly rotation: OneEuroFilter[];
  private readonly previousQuaternion = new THREE.Quaternion();
  private readonly incoming = new THREE.Quaternion();
  private hasPrevious = false;

  constructor(positionSettings: OneEuroSettings, rotationSettings: OneEuroSettings) {
    this.position = [0, 1, 2].map(() => new OneEuroFilter(positionSettings));
    this.rotation = [0, 1, 2, 3].map(() => new OneEuroFilter(rotationSettings));
  }

  /** Writes the smoothed version of `raw` into `out` (no allocations). */
  filter(raw: Pose, timeSec: number, out: Pose): Pose {
    const [fx, fy, fz] = this.position;
    out.position.set(
      fx!.filter(raw.position.x, timeSec),
      fy!.filter(raw.position.y, timeSec),
      fz!.filter(raw.position.z, timeSec),
    );

    // q and -q are the same rotation. If MediaPipe flips sign between frames, the
    // components would jump and the filter would "smooth" through a nonsense
    // rotation, so we keep each new quaternion on the same side as the last one.
    this.incoming.copy(raw.quaternion);
    if (this.hasPrevious && this.incoming.dot(this.previousQuaternion) < 0) {
      this.incoming.set(-this.incoming.x, -this.incoming.y, -this.incoming.z, -this.incoming.w);
    }
    const [qx, qy, qz, qw] = this.rotation;
    out.quaternion
      .set(
        qx!.filter(this.incoming.x, timeSec),
        qy!.filter(this.incoming.y, timeSec),
        qz!.filter(this.incoming.z, timeSec),
        qw!.filter(this.incoming.w, timeSec),
      )
      .normalize();
    this.previousQuaternion.copy(out.quaternion);
    this.hasPrevious = true;

    out.scale.copy(raw.scale);
    return out;
  }

  /** Forget history, e.g. when the face is lost, so the glasses don't slide in from the old pose. */
  reset(): void {
    [...this.position, ...this.rotation].forEach((f) => f.reset());
    this.hasPrevious = false;
  }
}
