// The per-frame loop and the head-anchored 3D content. Every frame:
//   new video frame? -> upload it as the background -> detect face on that same
//   frame (RAW pose) -> One Euro filter (SMOOTHED pose)
//   -> move the head group -> adapt lighting to the room -> render -> timings.
// Everything that happens per frame lives in the single useFrame callback below,
// so the whole pipeline can be read top to bottom in one place.
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getCanonicalFace } from '../lib/canonicalFace.ts';
import type { GlassesModel } from '../lib/catalog.ts';
import { CONFIG } from '../lib/config.ts';
import { clearDebugCanvas, drawLandmarks } from '../lib/debugDraw.ts';
import type { FaceTracker } from '../lib/faceTracker.ts';
import { RoomLightSampler, type RoomLight } from '../lib/lighting.ts';
import { setFade } from '../lib/materials.ts';
import { VideoFrameClock, type PerformanceMonitor } from '../lib/performance.ts';
import { VideoFrameTexture } from '../lib/videoFrameTexture.ts';
import { PoseFilter } from '../lib/oneEuroFilter.ts';
import { createPose, matrixFromPose, poseFromMediaPipeMatrix } from '../lib/poseMath.ts';
import Glasses from './Glasses.tsx';
import HeadOccluder from './HeadOccluder.tsx';
import VideoBackground from './VideoBackground.tsx';

interface TryOnSceneProps {
  video: HTMLVideoElement;
  tracker: FaceTracker;
  model: GlassesModel | null;
  monitor: PerformanceMonitor;
  smoothingEnabled: boolean;
  showDebug: boolean;
  debugCanvas: HTMLCanvasElement | null;
  onFaceVisibleChange: (visible: boolean) => void;
}

// A positive priority tells R3F that this callback renders the frame itself,
// so detection, pose update and render happen in a fixed, known order.
const RENDER_PRIORITY = 1;

// Shadow camera box around the head, in cm (the light sits ~60 cm from the head).
const SHADOW_EXTENT_CM = 13;
const SHADOW_NEAR_CM = 20;
const SHADOW_FAR_CM = 110;
// Small offsets that stop a surface from shadowing itself ("shadow acne").
const SHADOW_BIAS = -0.0005;
const SHADOW_NORMAL_BIAS = 0.02;

export default function TryOnScene(props: TryOnSceneProps) {
  const { video, tracker, model, monitor, smoothingEnabled, showDebug, debugCanvas, onFaceVisibleChange } = props;
  // The head group is moved by setting its matrix directly from the pose each frame.
  const headGroupRef = useRef<THREE.Group>(null);
  const glassesGroupRef = useRef<THREE.Group>(null);
  const keyLightRef = useRef<THREE.DirectionalLight>(null);
  const keyLightTargetRef = useRef<THREE.Object3D>(null);

  // Per-frame working state. Kept in a ref because it changes every frame without
  // needing a React re-render, and reused so nothing is allocated per frame.
  const frameStateRef = useRef({
    matrix: new THREE.Matrix4(),
    rawPose: createPose(), // straight from MediaPipe (kept for the stability tests)
    smoothedPose: createPose(), // after the One Euro filter (what the glasses use)
    poseFilter: new PoseFilter(CONFIG.smoothing.position, CONFIG.smoothing.rotation),
    lastVideoTime: -1,
    faceVisible: false,
    fade: 0, // 0 = glasses hidden, 1 = fully shown
    // Adaptive lighting: latest measurement of the room, and the eased value in use.
    lightSampler: null as RoomLightSampler | null, // created on first use (needs the DOM)
    lastLightSampleAt: -Infinity,
    roomLight: { intensity: 1, colour: new THREE.Color(1, 1, 1) } as RoomLight,
    appliedLight: { intensity: 1, colour: new THREE.Color(1, 1, 1) } as RoomLight,
    keyLightOffset: new THREE.Vector3(...CONFIG.lighting.keyLightOffsetCm),
  });

  // The background's copy of the camera frame (refreshed in the loop below).
  const videoFrame = useMemo(() => new VideoFrameTexture(video), [video]);
  useEffect(() => () => videoFrame.dispose(), [videoFrame]);

  // The key light aims at an object we move to the head each frame.
  useEffect(() => {
    if (keyLightRef.current && keyLightTargetRef.current) keyLightRef.current.target = keyLightTargetRef.current;
  }, []);

  // Records when each camera frame arrives, for the latency figure.
  const frameClockRef = useRef<VideoFrameClock | null>(null);
  useEffect(() => {
    const clock = new VideoFrameClock(video);
    frameClockRef.current = clock;
    return () => clock.stop();
  }, [video]);

  useEffect(() => {
    if (!showDebug && debugCanvas) clearDebugCanvas(debugCanvas);
  }, [showDebug, debugCanvas]);

  useFrame(({ gl, scene, camera }, deltaSec) => {
    const headGroup = headGroupRef.current;
    const frameState = frameStateRef.current;
    if (!headGroup) return;

    // 1. Only run the model when the camera has delivered a new frame.
    //    The screen may refresh at 60-120 Hz while the camera gives ~30 fps.
    const hasNewFrame =
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== frameState.lastVideoTime;
    let inferenceMs = 0;
    const frameNoticedAt = performance.now();
    if (hasNewFrame) {
      frameState.lastVideoTime = video.currentTime;

      // Upload this frame to the GPU now, immediately before tracking it. The camera
      // can deliver a newer frame while tracking runs (often on phones, where it
      // takes 20-40 ms); without this, the background could show that newer frame
      // under glasses placed for the older one, so they jump around whenever the
      // face moves quickly in the picture (e.g. a hand-held phone).
      videoFrame.upload(gl);

      // 2. Face tracking -> RAW pose. Timed on its own: this is the "AI" cost.
      const inferenceStart = performance.now();
      const detection = tracker.detect(video, inferenceStart);
      inferenceMs = performance.now() - inferenceStart;
      if (detection) {
        poseFromMediaPipeMatrix(detection.poseMatrix, frameState.matrix, frameState.rawPose);
        // 3. Smooth the pose. Both versions are kept: the tests compare them.
        frameState.poseFilter.filter(frameState.rawPose, inferenceStart / 1000, frameState.smoothedPose);
        // 4. Move everything attached to the head (glasses, occluder, debug mesh).
        const shownPose = smoothingEnabled ? frameState.smoothedPose : frameState.rawPose;
        matrixFromPose(shownPose, headGroup.matrix);
      } else {
        // Face lost: forget the filter history, so when the face comes back the
        // glasses snap to it instead of sliding over from where it was last seen.
        frameState.poseFilter.reset();
      }
      if (showDebug && debugCanvas) drawLandmarks(debugCanvas, detection?.landmarks ?? null);

      const faceVisible = detection !== null;
      if (faceVisible !== frameState.faceVisible) {
        frameState.faceVisible = faceVisible;
        onFaceVisibleChange(faceVisible);
      }
    }

    // 5. Adaptive lighting. A few times per second, measure the room's brightness
    //    and colour from the video; every frame, ease the lights towards it (easing
    //    avoids flicker when you move or the camera's auto-exposure hunts).
    const now = performance.now();
    const MS_PER_SECOND = 1000;
    if (hasNewFrame && now - frameState.lastLightSampleAt > MS_PER_SECOND / CONFIG.lighting.sampleRateHz) {
      frameState.lightSampler ??= new RoomLightSampler();
      frameState.lightSampler.sample(video, frameState.roomLight);
      frameState.lastLightSampleAt = now;
    }
    // Exponential easing: the same fraction of the remaining gap closes each second,
    // whatever the frame rate.
    const ease = 1 - Math.exp(-CONFIG.lighting.adaptSpeedPerSec * deltaSec);
    const applied = frameState.appliedLight;
    applied.intensity += (frameState.roomLight.intensity - applied.intensity) * ease;
    applied.colour.lerp(frameState.roomLight.colour, ease);
    scene.environmentIntensity = CONFIG.lighting.environmentIntensity * applied.intensity;
    const keyLight = keyLightRef.current;
    const keyLightTarget = keyLightTargetRef.current;
    if (keyLight && keyLightTarget) {
      keyLight.intensity = CONFIG.lighting.keyLightIntensity * applied.intensity;
      keyLight.color.copy(applied.colour);
      // Keep the light (and its shadow camera) centred on the head wherever it moves.
      headGroup.matrix.decompose(keyLightTarget.position, keyLightTarget.quaternion, keyLightTarget.scale);
      keyLightTarget.quaternion.identity();
      keyLightTarget.scale.set(1, 1, 1);
      keyLight.position.copy(keyLightTarget.position).add(frameState.keyLightOffset);
    }

    // 6. Fade the glasses in/out instead of popping. When the face is lost the
    //    head group keeps its last pose while it fades.
    const fadeStep = deltaSec / CONFIG.glasses.fadeDurationSec;
    const targetFade = frameState.faceVisible ? 1 : 0;
    const fade = THREE.MathUtils.clamp(
      frameState.fade + Math.sign(targetFade - frameState.fade) * fadeStep,
      0,
      1,
    );
    const glassesGroup = glassesGroupRef.current;
    if (glassesGroup && fade !== frameState.fade) setFade(glassesGroup, fade);
    frameState.fade = fade;
    headGroup.visible = fade > 0 || (showDebug && frameState.faceVisible);

    // 7. Render video background + head content in one pass.
    gl.render(scene, camera);

    // 8. Timings for the stats panel. Latency = frame arrival -> render submitted.
    //    It cannot include the camera's own exposure/USB delay or the display's
    //    scan-out, which the browser does not expose (see docs/PERFORMANCE.md).
    if (hasNewFrame) {
      const clock = frameClockRef.current;
      monitor.recordFrame({
        frameArrivedAt: clock?.latestArrivalMs ?? frameNoticedAt,
        arrivalSource: clock?.latestArrivalMs != null ? clock.source : 'loop',
        inferenceMs,
        renderedAt: performance.now(),
      });
    }
  }, RENDER_PRIORITY);

  const { shadowMapSize, shadowRadius } = CONFIG.lighting;
  return (
    <>
      {/* Key light: casts the frame's soft shadow on the face. Its shadow camera
          only needs to cover a head (±SHADOW_EXTENT_CM), which keeps the shadow sharp. */}
      <directionalLight
        ref={keyLightRef}
        castShadow
        shadow-mapSize={[shadowMapSize, shadowMapSize]}
        shadow-radius={shadowRadius}
        shadow-bias={SHADOW_BIAS}
        shadow-normalBias={SHADOW_NORMAL_BIAS}
        shadow-camera-left={-SHADOW_EXTENT_CM}
        shadow-camera-right={SHADOW_EXTENT_CM}
        shadow-camera-top={SHADOW_EXTENT_CM}
        shadow-camera-bottom={-SHADOW_EXTENT_CM}
        shadow-camera-near={SHADOW_NEAR_CM}
        shadow-camera-far={SHADOW_FAR_CM}
      />
      <object3D ref={keyLightTargetRef} />
      <VideoBackground texture={videoFrame.texture} />
      {/* matrixAutoUpdate=false: we write the group's matrix ourselves from the pose. */}
      <group ref={headGroupRef} matrixAutoUpdate={false} visible={false}>
        <HeadOccluder visibleForDebug={showDebug} />
        <group ref={glassesGroupRef}>
          {model && (
            <Suspense fallback={null}>
              <Glasses key={model.id} model={model} />
            </Suspense>
          )}
        </group>
        {showDebug && <DebugHead />}
      </group>
    </>
  );
}

// Debug view: the head axes and MediaPipe's canonical face as a wireframe. If the
// wireframe sits exactly on the face, the camera matching and pose are correct.
// Yellow dots mark the assumed ear roots (CONFIG.ear), to check the arm fit.
function DebugHead() {
  const [earX, earY, earZ] = CONFIG.ear.rootCm;
  return (
    <>
      <axesHelper args={[CONFIG.debug.poseAxesLengthCm]} />
      {[earX, -earX].map((x) => (
        <mesh key={x} position={[x, earY, earZ]} renderOrder={1}>
          <sphereGeometry args={[CONFIG.debug.earRootRadiusCm]} />
          <meshBasicMaterial color={CONFIG.debug.earRootColor} depthTest={false} />
        </mesh>
      ))}
      <mesh geometry={getCanonicalFace().geometry}>
        <meshBasicMaterial color={CONFIG.debug.faceWireframeColor} wireframe transparent opacity={0.35} />
      </mesh>
    </>
  );
}
