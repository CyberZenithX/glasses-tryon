// Draws the webcam video as a full-screen background *inside* the 3D scene.
// Drawing it in WebGL (instead of a separate <video> layer) means the video frame
// and the glasses are painted in the same render, so they never drift apart.
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

// The quad's vertices are already in "clip space" (-1..1 covers the whole canvas),
// so it ignores the camera and always fills the screen behind everything.
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

// No lighting or tone mapping, so the person looks exactly as their camera sees
// them. Camera pixels are sRGB-encoded: we decode them to linear light here
// (sRGBTransferEOTF) and <colorspace_fragment> encodes them back for the screen,
// so on screen the pixels are unchanged. (Decoding in the shader is reliable on
// all browsers; letting the GPU decode video textures is not.) Working in linear light matters for the lenses: they refract an
// off-screen copy of this background, which three.js keeps in linear light.
const fragmentShader = /* glsl */ `
  uniform sampler2D videoTexture;
  varying vec2 vUv;
  void main() {
    gl_FragColor = sRGBTransferEOTF(texture2D(videoTexture, vUv));
    #include <colorspace_fragment>
  }
`;

// Drawn before every other object (lower renderOrder = earlier).
const BACKGROUND_RENDER_ORDER = -1000;

export default function VideoBackground({ video }: { video: HTMLVideoElement }) {
  const material = useMemo(() => {
    const texture = new THREE.VideoTexture(video);
    // Sample the raw values; the shader does the sRGB decode itself.
    texture.colorSpace = THREE.NoColorSpace;
    return new THREE.ShaderMaterial({
      uniforms: { videoTexture: { value: texture } },
      vertexShader,
      fragmentShader,
      depthTest: false, // never hidden by anything...
      depthWrite: false, // ...and never hides anything (the glasses draw on top)
      toneMapped: false, // keep the camera image exactly as captured
    });
  }, [video]);

  useEffect(() => {
    return () => {
      material.uniforms.videoTexture?.value.dispose();
      material.dispose();
    };
  }, [material]);

  return (
    <mesh renderOrder={BACKGROUND_RENDER_ORDER} frustumCulled={false} material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
