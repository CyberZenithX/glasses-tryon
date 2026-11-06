// Small, unit-tested helpers for head poses. A "pose" is where the head is
// (position, in cm), which way it faces (rotation, as a quaternion) and its size
// (scale). The glasses, the occluder and the stability tests all use these.
import * as THREE from 'three';

export interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion; // a rotation stored as 4 numbers; avoids gimbal-lock problems of angles
  scale: THREE.Vector3;
}

export function createPose(): Pose {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1) };
}

/**
 * Splits MediaPipe's 16-number matrix into position / rotation / scale.
 * MediaPipe stores the matrix column by column, which is exactly the order
 * THREE.Matrix4.fromArray expects, so no transposing is needed.
 * `scratch` is passed in so nothing is allocated per frame.
 */
export function poseFromMediaPipeMatrix(data: ArrayLike<number>, scratch: THREE.Matrix4, out: Pose): Pose {
  scratch.fromArray(data as number[]);
  scratch.decompose(out.position, out.quaternion, out.scale);
  return out;
}

/** Rebuilds a 4x4 matrix from a pose (the reverse of the function above). */
export function matrixFromPose(pose: Pose, out: THREE.Matrix4): THREE.Matrix4 {
  return out.compose(pose.position, pose.quaternion, pose.scale);
}

export function copyPose(from: Pose, to: Pose): Pose {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.scale.copy(from.scale);
  return to;
}

const MM_PER_CM = 10;

/** Straight-line distance between two pose positions, in millimetres. */
export function positionDistanceMm(a: Pose, b: Pose): number {
  return a.position.distanceTo(b.position) * MM_PER_CM;
}

/** Smallest rotation angle that turns pose a into pose b, in degrees. */
export function rotationDifferenceDeg(a: Pose, b: Pose): number {
  return THREE.MathUtils.radToDeg(a.quaternion.angleTo(b.quaternion));
}

/**
 * How far (cm, along the head's "up" axis) the person's real nose bridge sits
 * above (+) or below (-) where the rigid head model puts it.
 *
 * Why: MediaPipe's pose fits one average face shape to all 478 landmarks at once.
 * That fit matches the eyes well, but the real nose bridge, where glasses actually
 * rest, drifts up or down relative to it as the camera moves above or below the
 * face. Glasses on a real face follow the nose, so we measure the gap here (in the
 * image: detected landmark vs the model's point projected with the same camera)
 * and the glasses slide along the nose by that amount.
 *
 * Pure arithmetic on numbers (no allocations), so it can run every frame.
 * `poseMatrix` is MediaPipe's column-major matrix; `landmarks` are its normalised
 * (0..1) image points; `anchors` are landmark indices to average over.
 */
export function noseBridgeOffsetCm(
  poseMatrix: ArrayLike<number>,
  landmarks: ArrayLike<{ x: number; y: number }>,
  anchors: readonly number[],
  canonical: readonly THREE.Vector3[],
  tanHalfFovY: number,
  aspect: number,
): number {
  const m = poseMatrix;
  const at = (i: number) => m[i] ?? 0;
  let dx = 0; // image-plane gap, converted to cm at the anchor's depth
  let dy = 0;
  let count = 0;
  for (const index of anchors) {
    const v = canonical[index];
    const detected = landmarks[index];
    if (!v || !detected) continue;
    // Model point in camera space (cm). Camera looks down -Z, so depth = -z.
    const x = at(0) * v.x + at(4) * v.y + at(8) * v.z + at(12);
    const y = at(1) * v.x + at(5) * v.y + at(9) * v.z + at(13);
    const depth = -(at(2) * v.x + at(6) * v.y + at(10) * v.z + at(14));
    // Half the visible width / height at that depth, in cm.
    const halfHeight = depth * tanHalfFovY;
    const halfWidth = halfHeight * aspect;
    // Detected point in the same units: normalised image coords -> cm at that depth.
    // (Image y grows downwards, camera y upwards.)
    const detectedX = (detected.x * 2 - 1) * halfWidth;
    const detectedY = (1 - detected.y * 2) * halfHeight;
    dx += detectedX - x;
    dy += detectedY - y;
    count++;
  }
  if (count === 0) return 0;
  dx /= count;
  dy /= count;
  // Only the part of the gap along the head's up axis (the direction glasses can
  // slide on a nose). That axis, as seen in the image, is the matrix's 2nd column.
  const upX = at(4);
  const upY = at(5);
  // Seen at a steep angle the axis looks shorter, so the same image gap means a
  // bigger slide; floor it so a near-edge-on view can't blow the value up.
  const MIN_VISIBLE_UP_SQUARED = 0.5;
  return (upX * dx + upY * dy) / Math.max(upX * upX + upY * upY, MIN_VISIBLE_UP_SQUARED);
}
