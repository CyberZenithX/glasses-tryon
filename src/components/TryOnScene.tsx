// The per-frame loop and the head-anchored 3D content. Every frame:
//   new video frame? -> upload it as the background -> detect face on that same
//   frame (RAW pose) -> One Euro filter (SMOOTHED pose)
//   -> move the head group -> adapt lighting to the room -> render -> timings
//   (+ the stability test recorder while a test runs).
// Everything that happens per frame lives in the single useFrame callback below,
// so the whole pipeline can be read top to bottom in one place.
// Capture & Compare adds two things: a capture (freeze the tracked frame and its
// pose) and a "still" mode that renders the frozen photo once per chosen frame.
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { copyMirroredCrop, copyVideoFrame, faceCrop, type CapturedPhoto } from '../lib/capture.ts';
import { getCanonicalFace } from '../lib/canonicalFace.ts';
import type { GlassesModel } from '../lib/catalog.ts';
import type { GlassesStyle } from '../lib/glassesStyle.ts';
import { CONFIG } from '../lib/config.ts';
import { clearDebugCanvas, drawLandmarks } from '../lib/debugDraw.ts';
import type { FaceTracker } from '../lib/faceTracker.ts';
import { RoomLightSampler, type RoomLight } from '../lib/lighting.ts';
import { setFade } from '../lib/materials.ts';
import type { TestRecorder } from '../lib/stabilityTest.ts';
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
  /** Lens tint, frame colour and personal fit from the Style panel. */
  glassesStyle: GlassesStyle;
  monitor: PerformanceMonitor;
  /** Records frames while a stability test runs (owned by App, like the monitor). */
  recorder: TestRecorder;
  smoothingEnabled: boolean;
  showDebug: boolean;
  debugCanvas: HTMLCanvasElement | null;
  onFaceVisibleChange: (visible: boolean) => void;
  /** Bumped by the Capture button: the next tracked frame with a face is captured (0 = none yet). */
  captureRequest: number;
  onCapture: (photo: CapturedPhoto) => void;
  /** Comparison mode: show this photo with no live tracking, instead of the camera. */
  stillPhoto: CapturedPhoto | null;
  /** Set while a comparison photo of `model` is wanted; called once with the rendered image. */
  onStillRendered: ((modelId: string, image: HTMLCanvasElement) => void) | null;
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
  const { video, tracker, model, monitor, recorder, smoothingEnabled, showDebug, debugCanvas } = props;
  const { onFaceVisibleChange, glassesStyle } = props;
  const { captureRequest, onCapture, stillPhoto, onStillRendered } = props;
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
    handledCaptureRequest: 0, // last captureRequest already answered
    wasStill: false, // true while comparison mode is showing a captured photo
  });

  // The background's copy of the camera frame (refreshed in the loop below).
  const videoFrame = useMemo(() => new VideoFrameTexture(video), [video]);
  useEffect(() => () => videoFrame.dispose(), [videoFrame]);

  // Comparison mode: the captured photo as a texture, replacing the live video.
  // Same settings as the video texture, so the photo looks exactly like the live view.
  const photoTexture = useMemo(() => {
    if (!stillPhoto) return null;
    const texture = new THREE.CanvasTexture(stillPhoto.canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }, [stillPhoto]);
  useEffect(() => () => photoTexture?.dispose(), [photoTexture]);
  // Which model was last rendered onto this photo: each is rendered only once.
  const stillRenderedModelRef = useRef<string | null>(null);
  useEffect(() => {
    stillRenderedModelRef.current = null;
  }, [stillPhoto]);

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

    // 0. Comparison mode: no tracking and no rendering, except one render per
    //    chosen frame, onto the captured photo at the captured pose.
    if (stillPhoto) {
      frameState.wasStill = true;
      const glassesGroup = glassesGroupRef.current;
      const wanted = onStillRendered && model && stillRenderedModelRef.current !== model.id;
      // Wait until the model has loaded and is mounted (Glasses names its group after the model).
      if (!wanted || !glassesGroup?.getObjectByName(model.id)) return;
      headGroup.matrix.copy(stillPhoto.headMatrix);
      headGroup.visible = true;
      setFade(glassesGroup, 1);
      applyRoomLight(scene, keyLightRef.current, keyLightTargetRef.current, headGroup, stillPhoto.light, frameState.keyLightOffset);
      const image = renderStillPhoto(gl, scene, camera, stillPhoto);
      stillRenderedModelRef.current = model.id;
      onStillRendered(model.id, image);
      return;
    }
    if (frameState.wasStill) {
      // Back from comparison: start fresh, so the glasses fade in on the live face
      // instead of jumping from the photo's pose.
      frameState.wasStill = false;
      frameState.poseFilter.reset();
      frameState.lastVideoTime = -1;
      frameState.fade = 0;
      if (glassesGroupRef.current) setFade(glassesGroupRef.current, 0);
      headGroup.visible = false;
      if (frameState.faceVisible) {
        frameState.faceVisible = false;
        onFaceVisibleChange(false);
      }
    }

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
      // Capture requested: freeze this frame into a canvas and track that frozen
      // copy (instead of the live video), so the photo and its pose are guaranteed
      // to come from exactly the same pixels.
      const captureCanvas = captureRequest !== frameState.handledCaptureRequest ? copyVideoFrame(video) : null;
      videoFrame.upload(gl);

      // 2. Face tracking -> RAW pose. Timed on its own: this is the "AI" cost.
      const inferenceStart = performance.now();
      const detection = tracker.detect(captureCanvas ?? video, inferenceStart);
      inferenceMs = performance.now() - inferenceStart;
      if (detection) {
        poseFromMediaPipeMatrix(detection.poseMatrix, frameState.matrix, frameState.rawPose);
        // 3. Smooth the pose. Both versions are kept: the tests compare them.
        frameState.poseFilter.filter(frameState.rawPose, inferenceStart / 1000, frameState.smoothedPose);
        // 4. Move everything attached to the head (glasses, occluder, debug mesh).
        const shownPose = smoothingEnabled ? frameState.smoothedPose : frameState.rawPose;
        matrixFromPose(shownPose, headGroup.matrix);
        if (captureCanvas) {
          // The RAW pose belongs to this exact frame; the smoothed one may trail
          // a moving head by a frame or two. (No face? The request stays open.)
          frameState.handledCaptureRequest = captureRequest;
          const roomLight = frameState.appliedLight;
          onCapture({
            canvas: captureCanvas,
            headMatrix: matrixFromPose(frameState.rawPose, new THREE.Matrix4()),
            light: { intensity: roomLight.intensity, colour: roomLight.colour.clone() },
            crop: faceCrop(detection.landmarks, captureCanvas.width, captureCanvas.height),
          });
        }
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
    applyRoomLight(scene, keyLightRef.current, keyLightTargetRef.current, headGroup, applied, frameState.keyLightOffset);

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
    const fading = fade !== frameState.fade;
    if (glassesGroup && fading) setFade(glassesGroup, fade);
    frameState.fade = fade;
    headGroup.visible = fade > 0 || (showDebug && frameState.faceVisible);

    // 7. Render video background + head content in one pass, but only when there
    //    is something new to show: a new camera frame, or a fade in progress. The
    //    screen refreshes at 60-120 Hz but the camera gives ~30 fps, so redrawing
    //    the same picture would only steal the GPU from face tracking (on phones
    //    both share it). Skipping a render keeps the last picture on screen.
    if (hasNewFrame || fading) gl.render(scene, camera);

    // 8. Timings for the stats panel. Latency = frame arrival -> render submitted.
    //    It cannot include the camera's own exposure/USB delay or the display's
    //    scan-out, which the browser does not expose (see docs/PERFORMANCE.md).
    //    During a Hold-still / Head-turn test, the same frame (raw AND smoothed
    //    pose, timings) is also written to the test recorder.
    if (hasNewFrame) {
      const clock = frameClockRef.current;
      const frameArrivedAt = clock?.latestArrivalMs ?? frameNoticedAt;
      const renderedAt = performance.now();
      monitor.recordFrame({
        frameArrivedAt,
        arrivalSource: clock?.latestArrivalMs != null ? clock.source : 'loop',
        inferenceMs,
        renderedAt,
      });
      if (recorder.running) {
        const { faceVisible, rawPose, smoothedPose } = frameState;
        recorder.record(renderedAt, faceVisible, rawPose, smoothedPose, inferenceMs, renderedAt - frameArrivedAt);
      }
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
      <VideoBackground texture={photoTexture ?? videoFrame.texture} />
      {/* matrixAutoUpdate=false: we write the group's matrix ourselves from the pose. */}
      <group ref={headGroupRef} matrixAutoUpdate={false} visible={false}>
        <HeadOccluder visibleForDebug={showDebug} />
        <group ref={glassesGroupRef}>
          {model && (
            <Suspense fallback={null}>
              <Glasses key={model.id} model={model} style={glassesStyle} />
            </Suspense>
          )}
        </group>
        {showDebug && <DebugHead />}
      </group>
    </>
  );
}

/** Sets the scene's lights for a room light level, with the key light following the head. */
function applyRoomLight(
  scene: THREE.Scene,
  keyLight: THREE.DirectionalLight | null,
  keyLightTarget: THREE.Object3D | null,
  headGroup: THREE.Group,
  light: RoomLight,
  keyLightOffset: THREE.Vector3,
): void {
  scene.environmentIntensity = CONFIG.lighting.environmentIntensity * light.intensity;
  if (!keyLight || !keyLightTarget) return;
  keyLight.intensity = CONFIG.lighting.keyLightIntensity * light.intensity;
  keyLight.color.copy(light.colour);
  // Keep the light (and its shadow camera) centred on the head wherever it moves.
  headGroup.matrix.decompose(keyLightTarget.position, keyLightTarget.quaternion, keyLightTarget.scale);
  keyLightTarget.quaternion.identity();
  keyLightTarget.scale.set(1, 1, 1);
  keyLight.position.copy(keyLightTarget.position).add(keyLightOffset);
}

const savedCanvasSize = new THREE.Vector2();

/**
 * Renders the scene (photo background + glasses at the captured pose) at the
 * photo's own size and returns the face crop, mirrored like the live view. Uses
 * the one existing renderer: its size is switched for this render and restored
 * straight after. The comparison view covers the canvas, so this never shows.
 */
function renderStillPhoto(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  photo: CapturedPhoto,
): HTMLCanvasElement {
  const { width: photoWidth, height: photoHeight } = photo.canvas;
  const { photoHeightPx, maxRenderScale, maxRenderSizePx } = CONFIG.compare;
  // Render bigger than the camera frame when the face crop would be small, so the
  // glasses' edges stay crisp in the final photo (within the GPU size limit).
  const cropHeightPx = photo.crop.height * photoHeight;
  const scale = Math.min(
    THREE.MathUtils.clamp(photoHeightPx / cropHeightPx, 1, maxRenderScale),
    maxRenderSizePx / Math.max(photoWidth, photoHeight),
  );

  const pixelRatio = gl.getPixelRatio();
  gl.getSize(savedCanvasSize);
  gl.setPixelRatio(1);
  gl.setSize(Math.round(photoWidth * scale), Math.round(photoHeight * scale), false);
  // The 3D camera must have the photo's aspect ratio (MediaPipe's camera model).
  const perspective = camera instanceof THREE.PerspectiveCamera ? camera : null;
  const savedAspect = perspective?.aspect ?? 1;
  if (perspective) {
    perspective.aspect = photoWidth / photoHeight;
    perspective.updateProjectionMatrix();
  }

  gl.render(scene, camera);
  // Copy now, in the same task as the render: once the browser has shown the
  // canvas its pixels are no longer readable.
  const image = copyMirroredCrop(gl.domElement, photo.crop, photoHeightPx);

  if (perspective) {
    perspective.aspect = savedAspect;
    perspective.updateProjectionMatrix();
  }
  gl.setPixelRatio(pixelRatio);
  gl.setSize(savedCanvasSize.x, savedCanvasSize.y, false);
  return image;
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
