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
