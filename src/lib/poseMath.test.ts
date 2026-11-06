import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createPose,
  matrixFromPose,
  noseBridgeOffsetCm,
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

describe('noseBridgeOffsetCm', () => {
  const tanHalfFovY = Math.tan(THREE.MathUtils.degToRad(63 / 2));
  const aspect = 16 / 9;
  // Two anchor points around a nose bridge, in head coordinates (cm).
  const canonical = [new THREE.Vector3(0, 3.3, 5.2), new THREE.Vector3(0, 2.5, 5.8)];
  const anchors = [0, 1];
  // Head 40 cm away, a little to the side, looking slightly down at the camera.
  const pose = new THREE.Matrix4().compose(
    new THREE.Vector3(3, -2, -40),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0.3, 0)),
    new THREE.Vector3(1, 1, 1),
  );

  /** Where the anchors land in the image if the real bridge is `slideCm` up the nose. */
  function landmarksFor(slideCm: number) {
    return canonical.map((v) => {
      const p = v.clone().add(new THREE.Vector3(0, slideCm, 0)).applyMatrix4(pose);
      const depth = -p.z;
      return {
        x: (p.x / (depth * tanHalfFovY * aspect) + 1) / 2,
        y: (1 - p.y / (depth * tanHalfFovY)) / 2,
      };
    });
  }

  it('is zero when the detected bridge is where the model puts it', () => {
    const offset = noseBridgeOffsetCm(pose.elements, landmarksFor(0), anchors, canonical, tanHalfFovY, aspect);
    expect(offset).toBeCloseTo(0, 6);
  });

  it('recovers how far the real bridge sits up or down the nose', () => {
    for (const slide of [-0.6, -0.2, 0.3]) {
      const offset = noseBridgeOffsetCm(pose.elements, landmarksFor(slide), anchors, canonical, tanHalfFovY, aspect);
      expect(offset).toBeCloseTo(slide, 1); // within 0.05 cm (perspective makes it inexact)
    }
  });
});
