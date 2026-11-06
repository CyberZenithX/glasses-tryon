// An invisible stand-in for the user's head. It is drawn before the glasses and
// writes only to the depth buffer (the GPU's per-pixel "what is nearest" memory),
// never to colour. So the video still shows through, but any part of the glasses
// that is *behind* the head (far arm on a head turn, arm tips behind the ears)
// fails the depth test and is not drawn: that is what makes the glasses look worn.
// The same face shape also *receives* the frame's shadow (FaceShadowReceiver).
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { getCanonicalFace } from '../lib/canonicalFace.ts';
import { CONFIG } from '../lib/config.ts';
import { earVolume } from '../lib/ear.ts';

// Drawn after the video background (-1000) and before the glasses (0).
const OCCLUDER_RENDER_ORDER = -1;
const SPHERE_SEGMENTS = 24;

/**
 * Copy of the canonical face whose sides (behind the cheeks) are pulled in a bit,
 * so the arm nearest the camera rests on the skin instead of sinking into it.
 */
function createFaceOccluderGeometry(): THREE.BufferGeometry {
  const { faceSideWidthScale, faceSideStartZ } = CONFIG.occluder;
  const geometry = getCanonicalFace().geometry.clone();
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i);
    // 0 at faceSideStartZ and in front of it, 1 at z = 0 and behind it: a smooth ramp.
    const amount = THREE.MathUtils.smoothstep(faceSideStartZ - z, 0, faceSideStartZ);
    positions.setX(i, positions.getX(i) * THREE.MathUtils.lerp(1, faceSideWidthScale, amount));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

export default function HeadOccluder({ visibleForDebug }: { visibleForDebug: boolean }) {
  const faceGeometry = useMemo(() => createFaceOccluderGeometry(), []);
  const sphereGeometry = useMemo(() => new THREE.SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS), []);

  // colorWrite=false: invisible, but still fills the depth buffer. Used in the
  // debug view too, so the debug view hides exactly what the normal view hides.
  const depthMaterial = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false }), []);
  // Debug view only: a see-through tint drawn over the same shapes, to check their
  // placement. It doesn't write depth, so it never changes what is hidden.
  const tintMaterial = useMemo(
    () =>
      visibleForDebug
        ? new THREE.MeshBasicMaterial({
            color: CONFIG.debug.occluderColor,
            transparent: true,
            opacity: CONFIG.debug.occluderOpacity,
            depthWrite: false,
          })
        : null,
    [visibleForDebug],
  );

  useEffect(() => () => depthMaterial.dispose(), [depthMaterial]);
  useEffect(() => () => tintMaterial?.dispose(), [tintMaterial]);
  useEffect(
    () => () => {
      faceGeometry.dispose();
      sphereGeometry.dispose();
    },
    [faceGeometry, sphereGeometry],
  );

  // Invisible except where the frame's shadow falls: ShadowMaterial draws only
  // the shadow, darkening the video of the face underneath it.
  const shadowMaterial = useMemo(
    () => new THREE.ShadowMaterial({ opacity: CONFIG.lighting.faceShadowOpacity, depthWrite: false }),
    [],
  );
  useEffect(() => () => shadowMaterial.dispose(), [shadowMaterial]);

  const { skullCentre, skullRadii } = CONFIG.occluder;
  // Ears: placed from the shared ear root, so arms (aimed at the same root) vanish
  // exactly where they reach the ear. See ear.ts.
  const ear = useMemo(() => earVolume(), []);
  // Every shape is drawn with the depth material, plus the tint in the debug view.
  const materials = tintMaterial ? [depthMaterial, tintMaterial] : [depthMaterial];
  return (
    <group>
      {materials.map((material) => (
        <group key={material.uuid}>
          <mesh geometry={faceGeometry} material={material} renderOrder={OCCLUDER_RENDER_ORDER} />
          <mesh
            geometry={sphereGeometry}
            material={material}
            position={skullCentre}
            scale={skullRadii}
            renderOrder={OCCLUDER_RENDER_ORDER}
          />
          {/* Ears: one each side (person's left at +X, right at -X). */}
          {[1, -1].map((side) => (
            <mesh
              key={side}
              geometry={sphereGeometry}
              material={material}
              position={[side * ear.centre.x, ear.centre.y, ear.centre.z]}
              scale={ear.radii}
              renderOrder={OCCLUDER_RENDER_ORDER}
            />
          ))}
        </group>
      ))}
      <mesh geometry={faceGeometry} material={shadowMaterial} receiveShadow />
    </group>
  );
}
