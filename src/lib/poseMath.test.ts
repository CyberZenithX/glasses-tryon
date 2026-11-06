import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createPose,
  matrixFromPose,
  poseFromMediaPipeMatrix,
  positionDistanceMm,
  rotationDifferenceDeg,
} from './poseMath.ts';

describe('poseFromMediaPipeMatrix', () => {
  it('reads translation from the last column (column-major layout)', () => {
    // A face 50 cm in front of the camera, 3 cm to the right, 2 cm up, no rotation.
    const data = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 2, -50, 1];
    const pose = poseFromMediaPipeMatrix(data, new THREE.Matrix4(), createPose());
    expect(pose.position.toArray()).toEqual([3, 2, -50]);
    expect(pose.scale.x).toBeCloseTo(1);
    expect(rotationDifferenceDeg(pose, createPose())).toBeCloseTo(0);
  });

  it('round-trips through matrixFromPose', () => {
    const original = new THREE.Matrix4().compose(
      new THREE.Vector3(1, -2, -40),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, -0.3, 0.05)),
      new THREE.Vector3(1.05, 1.05, 1.05),
    );
    const pose = poseFromMediaPipeMatrix(original.toArray(), new THREE.Matrix4(), createPose());
    const rebuilt = matrixFromPose(pose, new THREE.Matrix4());
    rebuilt.toArray().forEach((value, i) => expect(value).toBeCloseTo(original.elements[i] ?? NaN, 6));
  });
});

describe('pose differences', () => {
  it('measures position distance in millimetres', () => {
    const a = createPose();
    const b = createPose();
    b.position.set(0.3, 0.4, 0); // 0.5 cm away
    expect(positionDistanceMm(a, b)).toBeCloseTo(5);
  });

  it('measures rotation difference in degrees', () => {
    const a = createPose();
    const b = createPose();
    b.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(10));
    expect(rotationDifferenceDeg(a, b)).toBeCloseTo(10);
  });
});
