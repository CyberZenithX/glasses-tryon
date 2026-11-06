// The per-frame loop and the head-anchored 3D content. Every frame:
//   new video frame? -> detect face (RAW pose) -> One Euro filter (SMOOTHED pose)
//   -> move the head group -> render -> timings.
// Everything that happens per frame lives in the single useFrame callback below,
// so the whole pipeline can be read top to bottom in one place.
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getCanonicalFace } from '../lib/canonicalFace.ts';
import type { GlassesModel } from '../lib/catalog.ts';
import { CONFIG } from '../lib/config.ts';
import { clearDebugCanvas, drawLandmarks } from '../lib/debugDraw.ts';
import type { FaceTracker } from '../lib/faceTracker.ts';
import { setFade } from '../lib/materials.ts';
import { VideoFrameClock, type PerformanceMonitor } from '../lib/performance.ts';
import { PoseFilter } from '../lib/oneEuroFilter.ts';
import { createPose, matrixFromPose, poseFromMediaPipeMatrix } from '../lib/poseMath.ts';
import Glasses from './Glasses.tsx';
import HeadOccluder from './HeadOccluder.tsx';

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

export default function TryOnScene(props: TryOnSceneProps) {
  const { video, tracker, model, monitor, smoothingEnabled, showDebug, debugCanvas, onFaceVisibleChange } = props;
  // The head group is moved by setting its matrix directly from the pose each frame.
  const headGroupRef = useRef<THREE.Group>(null);
  const glassesGroupRef = useRef<THREE.Group>(null);

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
  });

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

      // 2. Face tracking -> RAW pose. Timed on its own: this is the "AI" cost.
      const inferenceStart = performance.now();
      const detection = tracker.detect(video, inferenceStart);
      inferenceMs = performance.now() - inferenceStart;
      if (detection) {
        poseFromMediaPipeMatrix(detection.poseMatrix, frameState.matrix, frameState.rawPose);
        // 3. Smooth the pose. Both versions are kept: the tests compare them.
        const MS_PER_SECOND = 1000;
        frameState.poseFilter.filter(frameState.rawPose, inferenceStart / MS_PER_SECOND, frameState.smoothedPose);
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

    // 5. Fade the glasses in/out instead of popping. When the face is lost the
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

    // 6. Render video background + head content in one pass.
    gl.render(scene, camera);

    // 7. Timings for the stats panel. Latency = frame arrival -> render submitted.
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

  return (
    // matrixAutoUpdate=false: we write the group's matrix ourselves from the pose.
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
  );
}

// Debug view: the head axes and MediaPipe's canonical face as a wireframe. If the
// wireframe sits exactly on the face, the camera matching and pose are correct.
function DebugHead() {
  return (
    <>
      <axesHelper args={[CONFIG.debug.poseAxesLengthCm]} />
      <mesh geometry={getCanonicalFace().geometry}>
        <meshBasicMaterial color={CONFIG.debug.faceWireframeColor} wireframe transparent opacity={0.35} />
      </mesh>
    </>
  );
}
