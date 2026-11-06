// Material helpers for loaded glasses models. Used to fade the glasses in and out
// when a face appears or disappears.
import * as THREE from 'three';

interface FadeInfo {
  baseOpacity: number;
  baseTransparent: boolean;
}

function forEachMaterial(root: THREE.Object3D, visit: (material: THREE.Material) => void): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(visit);
  });
}

/**
 * Multiplies every material's original opacity by `fade` (0 = invisible, 1 = normal).
 * While partly faded, materials are switched to transparent; at 1 they go back to
 * their original setting, so solid frames sort and render normally.
 */
export function setFade(root: THREE.Object3D, fade: number): void {
  forEachMaterial(root, (material) => {
    const info = (material.userData.fade ??= {
      baseOpacity: material.opacity,
      baseTransparent: material.transparent,
    }) as FadeInfo;
    material.opacity = info.baseOpacity * fade;
    const transparent = fade < 1 || info.baseTransparent;
    if (material.transparent !== transparent) {
      material.transparent = transparent;
      material.needsUpdate = true; // switching transparency changes the shader
    }
  });
}
