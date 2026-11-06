// Checks the ear occluder's placement against the rule the arms rely on: an arm
// aimed at the ear root is visible up to the ear and hidden once it reaches it.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from './config.ts';
import { earVolume, isInsideEar } from './ear.ts';

const [rootX, rootY, rootZ] = CONFIG.ear.rootCm;
const armY = rootY + CONFIG.ear.armRestHeightCm;

describe('earVolume', () => {
  it('leaves the arm visible in front of the ear root', () => {
    for (const ahead of [0.3, 1, 3]) {
      expect(isInsideEar(new THREE.Vector3(rootX, armY, rootZ + ahead))).toBe(false);
    }
  });

  it('hides the arm once it reaches the ear, on both sides of the head', () => {
    for (const behind of [0.5, 1.5, 2.5]) {
      expect(isInsideEar(new THREE.Vector3(rootX, armY, rootZ - behind))).toBe(true);
      expect(isInsideEar(new THREE.Vector3(-rootX, armY, rootZ - behind))).toBe(true);
    }
  });

  it('hides arm tips that curl down behind the ear', () => {
    expect(isInsideEar(new THREE.Vector3(rootX, rootY - 1, rootZ - 3))).toBe(true);
  });

  it('rises above the arm, like the top of a real ear', () => {
    const { centre } = earVolume();
    expect(isInsideEar(new THREE.Vector3(rootX, armY + 0.5, centre.z))).toBe(true);
    expect(isInsideEar(new THREE.Vector3(rootX, rootY + CONFIG.ear.helixAboveRootCm + 0.3, centre.z))).toBe(false);
  });

  it('never covers the face or the frame front', () => {
    expect(isInsideEar(new THREE.Vector3(7, 2.8, 5))).toBe(false); // hinge
    expect(isInsideEar(new THREE.Vector3(7.7, 0.7, -2.4))).toBe(false); // cheek edge by the ear
  });
});
