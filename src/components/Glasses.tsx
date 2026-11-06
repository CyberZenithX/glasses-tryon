// Loads one glasses model (.glb) and places it on the canonical face: scaled to its
// real width, lenses centred on the eyes, front resting on the nose bridge, with a
// slight natural tilt. It lives inside the head group, so it follows the head pose.
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { eyeCentre, getCanonicalFace, LANDMARK } from '../lib/canonicalFace.ts';
import type { GlassesModel } from '../lib/catalog.ts';
import { CONFIG } from '../lib/config.ts';
import { computeGlassesFit } from '../lib/glassesFit.ts';

export default function Glasses({ model }: { model: GlassesModel }) {
  const gltf = useGLTF(model.file, CONFIG.glasses.dracoDecoderPath);

  const { scene, fit, tiltPivot } = useMemo(() => {
    // Clone so per-instance changes (fit, fade) never leak into drei's shared cache.
    const scene = gltf.scene.clone(true);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) object.material = (object.material as THREE.Material).clone();
    });
    const face = getCanonicalFace();
    const bridge = face.vertices[LANDMARK.noseBridge] ?? eyeCentre(face);
    return { scene, fit: computeGlassesFit(scene, model), tiltPivot: bridge.clone() };
  }, [gltf, model]);

  // The tilt pivots around the nose bridge, like real glasses resting on the nose.
  const tiltRad = THREE.MathUtils.degToRad(CONFIG.glasses.pantoscopicTiltDeg);
  const offsetFromPivot = fit.position.clone().sub(tiltPivot);

  return (
    <group position={tiltPivot} rotation-x={tiltRad}>
      <group position={offsetFromPivot} rotation={fit.rotation} scale={fit.scale}>
        <primitive object={scene} />
      </group>
    </group>
  );
}
