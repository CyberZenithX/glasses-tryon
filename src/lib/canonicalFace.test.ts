import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { eyeCentre, getCanonicalFace, LANDMARK } from './canonicalFace.ts';

const face = getCanonicalFace();

describe('canonical face', () => {
  it('has MediaPipe’s 468 face-mesh vertices and 898 triangles', () => {
    expect(face.vertices).toHaveLength(468);
    expect(face.geometry.index?.count).toBe(898 * 3);
  });

  it('is in centimetres, facing +Z (towards the camera), symmetric left/right', () => {
    const left = face.vertices[LANDMARK.leftEyeOuter]!;
    const right = face.vertices[LANDMARK.rightEyeOuter]!;
    // Outer eye corners of an average adult are roughly 9 cm apart.
    expect(left.distanceTo(right)).toBeGreaterThan(8);
    expect(left.distanceTo(right)).toBeLessThan(10);
    expect(left.x).toBeCloseTo(-right.x);
    // The nose bridge sticks out in front of the eye corners.
    expect(face.vertices[LANDMARK.noseBridge]!.z).toBeGreaterThan(left.z);
  });

  it('has triangles wound so their normals point out of the face', () => {
    // Normal at the nose tip (landmark 4) should point towards the camera (+Z).
    const normals = face.geometry.getAttribute('normal');
    const noseTipNormal = new THREE.Vector3().fromBufferAttribute(normals, 4);
    expect(noseTipNormal.z).toBeGreaterThan(0.5);
  });

  it('finds the eye centre on the mid-line', () => {
    const centre = eyeCentre(face);
    expect(centre.x).toBeCloseTo(0);
    expect(centre.y).toBeGreaterThan(2);
  });
});
