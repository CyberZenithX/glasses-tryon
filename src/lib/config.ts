// Every tunable value in the app lives here, with a note on what changing it does.
// Other modules import from this file instead of hard-coding numbers, so tuning
// the try-on never means hunting through the code.

export const CONFIG = {
  webcam: {
    // Requested camera resolution. The browser picks the closest mode it supports.
    // Lower values (e.g. 640x480) are cheaper to upload to the GPU each frame; try
    // that first if FPS is below target. Face tracking itself downsamples internally,
    // so resolution mostly affects how sharp the video looks, not tracking quality.
    idealWidth: 1280,
    idealHeight: 720,
    // Requested frame rate. Tracking runs once per new camera frame, so this caps FPS.
    idealFrameRate: 30,
  },

  tracker: {
    // Files are served from this app's own host (copied into /public), never a CDN.
    wasmBasePath: '/mediapipe/wasm',
    modelPath: '/mediapipe/face_landmarker.task',
    // Confidence thresholds (0..1). Higher = fewer false faces but tracking drops
    // out sooner in poor light or at steep angles. Lower = the opposite.
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  },

  camera: {
    // These three values MUST match the virtual camera MediaPipe assumes when it
    // computes the face transformation matrix (see mediapipe/tasks/cc/vision/
    // face_geometry/face_geometry_from_landmarks_graph.cc). If the Three.js camera
    // differs, the glasses drift off the face as you move. Not a tuning knob.
    verticalFovDeg: 63,
    nearCm: 1, // MediaPipe's metric space is in centimetres
    farCm: 10000,
  },

  // One Euro filter settings (see oneEuroFilter.ts). Tuning recipe: hold still and
  // lower minCutoff until the glasses stop shaking; then move your head and raise
  // beta until they stop trailing behind. Run the Hold-still / Head-turn tests to measure.
  smoothing: {
    position: {
      minCutoff: 1.0, // Hz when still. Lower = steadier, but slow drifts lag more.
      beta: 0.15, // per (cm/s). Higher = glasses keep up better when you move.
      derivativeCutoff: 1.0,
    },
    rotation: {
      // Quaternion components change ~0.5 per radian, so beta is larger here.
      minCutoff: 1.5,
      beta: 6.0,
      derivativeCutoff: 1.0,
    },
  },

  rendering: {
    // Render resolution relative to CSS pixels. 2 = sharp on retina screens; capped
    // so 3x phones don't render 9x the pixels. Lower the max to 1.5 if a phone is slow.
    devicePixelRatioRange: [1, 2] as [number, number],
  },

  glasses: {
    // Draco decoder for compressed .glb files, served locally (drei would use a CDN).
    dracoDecoderPath: '/draco/',
    // How far in front of the nose-bridge skin the front of the frame sits, in cm.
    // Bigger = glasses float further from the face.
    frontGapFromNoseBridgeCm: 0.6,
    // Real glasses tilt slightly, with the lower rims closer to the cheeks
    // ("pantoscopic tilt"), and this tilt is added to every model. Positive = lower rims move in.
    pantoscopicTiltDeg: 6,
    // Temple arm length from hinge to tip, in cm. Every model's arms are stretched or
    // shrunk to this so they reach just behind the ear. Real arms are ~13.5-15 cm.
    // Increase if arm tips stop in front of the ear; decrease if they reach too far back.
    templeLengthCm: 14,
    // Limits on that stretch, so an unusual model can't be distorted too much.
    templeStretchRange: [0.7, 1.5] as [number, number],
    // Arms modelled opened outwards by more than this (degrees) are swung back in
    // so they run along the head instead of sticking out behind the ears.
    minArmSplayToFixDeg: 2,
    // How much the arms slope down from the hinge towards the ear (degrees).
    // Increase if arms pass above the ears; decrease if they pass below.
    templeSlopeDownDeg: 7,
    // Fraction of a model's depth (front to temple tips) that counts as "the frame
    // front". Its width is the frame width and its centre goes on the eyes. Using
    // only the front means temple arms (which may splay wider or droop) are ignored.
    frontSliceFraction: 0.08,
    // Lens glass (see materials.ts). Roughness: 0 = perfectly clear; raise for a
    // frosted look. IOR 1.5 = ordinary glass/CR-39 plastic lenses.
    lensRoughness: 0.04,
    lensIor: 1.5,
    lensThicknessCm: 0.2,
    clearLensTint: '#f2f6f8', // faint cool tint of uncoated lenses
    // Strength of reflections on lenses (1 = physically full). Real lenses have an
    // anti-reflective coating, so they reflect less than bare glass.
    lensReflectionStrength: 0.5,
    // Glossiness of the clear-coat layer on acetate/plastic frames (0 = mirror-like).
    clearcoatRoughness: 0.08,
    // How fast the glasses fade in/out when a face appears/disappears (seconds).
    fadeDurationSec: 0.25,
  },

  // The invisible head shape that hides parts of the glasses behind the head and
  // ears (see HeadOccluder.tsx). All values are in canonical-face centimetres:
  // +X = person's left, +Y = up, +Z = towards the camera; nose tip is at z ≈ 7.6.
  occluder: {
    // The canonical face is slightly wider at the sides than a 140 mm frame's
    // arms, which would make the arm nearest the camera vanish "into" the cheek on
    // head turns. Behind faceSideStartZ the face's sides are pulled in to this
    // fraction of their width (fully by z = 0). Lower = more of the near arm visible.
    faceSideWidthScale: 0.9,
    faceSideStartZ: 3,
    // Ellipsoid for the skull behind the face. Kept narrower than the arms (so the
    // near arm stays visible) and behind the forehead/eyes (so it never covers the
    // frame front).
    skullCentre: [0, 2, -4] as [number, number, number],
    skullRadii: [6.8, 9, 8] as [number, number, number],
    // One flattened ellipsoid per ear (mirrored for the other side). The arm tips
    // pass behind these. Raise earCentre's Y if arm tips still show behind the ears.
    earCentre: [7.4, 0.3, -6.8] as [number, number, number],
    earRadii: [0.9, 2.8, 2.2] as [number, number, number],
  },

  // Lighting of the glasses. "Adaptive" = follows the brightness and colour of the
  // room as seen by the camera, so glasses look darker in a dim room, brighter in a
  // bright one, and warm under warm lamps, like real objects in that room.
  lighting: {
    environmentMap: '/hdr/studio_small_09_1k.hdr', // CC0, Poly Haven (local file)
    // How often to measure the video's brightness (per second). Cheap: it reads a
    // tiny 16x9 copy of the frame.
    sampleRateHz: 4,
    sampleWidth: 16,
    sampleHeight: 9,
    // Average video brightness (0..1) at which the lights are at their base strength.
    referenceBrightness: 0.45,
    // How strongly light follows the room. 0 = ignore the room, 1 = proportional.
    brightnessSensitivity: 1.0,
    // Final light multiplier is clamped to this range, so a black or blown-out
    // frame never makes the glasses vanish or glow.
    intensityRange: [0.15, 1.6] as [number, number],
    // How much the room's average colour tints the lights (0 = pure white light).
    colourTintStrength: 0.35,
    // Fraction of the way to the new light level moved each second. Higher = reacts
    // faster to the room; lower = smoother (no flicker when you move).
    adaptSpeedPerSec: 2.5,
    // Base strengths before adaptation.
    environmentIntensity: 1.0,
    keyLightIntensity: 1.6,
    // Key light position relative to the head (cm): above and in front, like a
    // ceiling light or window. It casts the frame's shadow on the face.
    keyLightOffsetCm: [8, 40, 45] as [number, number, number],
    shadowMapSize: 1024,
    shadowRadius: 6, // softness of the frame's shadow on the face
    // How dark the frame's shadow on the face is (0 = invisible, 1 = black).
    faceShadowOpacity: 0.2,
    // Soft dark patch under the nose pads / bridge, where the frame rests.
    noseContactShadowOpacity: 0.32,
    noseContactShadowSizeCm: [3.2, 1.6] as [number, number],
  },

  stats: {
    // How many recent frames the live FPS / latency figures average over.
    // Bigger = steadier numbers that react more slowly to changes.
    windowFrames: 90, // ~3 s at 30 fps
    // How often the on-screen stats panel refreshes (per second). Refreshing
    // less often keeps the panel readable and costs almost nothing.
    panelRefreshHz: 4,
  },

  debug: {
    landmarkRadiusPx: 1.6, // size of each landmark dot in the debug view
    landmarkColor: '#3ee6a8',
    poseAxesLengthCm: 8, // length of the red/green/blue head axes in the debug view
    faceWireframeColor: '#3ee6a8', // canonical face mesh drawn on the face in debug view
    occluderColor: '#ff4fa3', // the debug view tints the (normally invisible) occluder this colour
    occluderOpacity: 0.25,
  },
} as const;
